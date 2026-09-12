<!--
  SingleAvatar3D - Single 3D Avatar Display Component
  
  Displays a single Three.js avatar model with auto-rotation and interaction.
  No controls, just the avatar.
  
  @author StyleSnap Team
  @version 1.0.0
-->
<template>
  <div class="single-avatar-container" ref="containerRef" style="width: 100%; height: 100%;">
    <!-- Loading State -->
    <div v-if="isLoading" class="absolute inset-0 flex items-center justify-center">
      <div class="spinner-modern"></div>
    </div>

    <!-- 3D Canvas -->
    <canvas 
      ref="canvasRef" 
      class="avatar-canvas w-full h-full"
      @click="!isMobile && handleClick()"
      @mouseenter="!isMobile && (isHovering = true)"
      @mouseleave="!isMobile && (isHovering = false)"
    ></canvas>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'

// Dynamic Three.js import for code splitting
let THREE = null
let GLTFLoader = null

const loadThreeJS = async () => {
  if (THREE) return { THREE, GLTFLoader }
  
  const [threeModule, gltfModule] = await Promise.all([
    import('three'),
    import('three/examples/jsm/loaders/GLTFLoader')
  ])
  
  THREE = threeModule
  GLTFLoader = gltfModule.GLTFLoader
  
  return { THREE, GLTFLoader }
}

// Props
const props = defineProps({
  avatarUrl: {
    type: String,
    required: true
  },
  autoRotate: {
    type: Boolean,
    default: false
  }
})

// Refs
const containerRef = ref(null)
const canvasRef = ref(null)
const isLoading = ref(true)
const isHovering = ref(false)

// Detect mobile device
const isMobile = ref(false)
const checkMobile = () => {
  isMobile.value = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768
}

// Three.js variables
let scene, camera, renderer, loader, avatar = null
let animationFrameId = null
let disposed = false
let avatarLoadId = 0
let dimensionFrameId = null
let finishDimensionWait = null
let visibilityObserver = null
let resizeObserver = null
let resizeTimeout = null
let initialResizeTimeout = null
let autoRotateSpeed = 0.012 // Increased rotation speed (doubled from 0.006)

// Animation state
let isAnimating = false
let isRotationPaused = true // Start paused, will be enabled when autoRotate prop is true
let animationStartTime = 0
let animationDuration = 2000 // 2 seconds
let currentAnimationType = null
let originalBoneStates = null
let originalModelState = null // Store original model position, rotation, scale
const ANIMATION_TYPES = ['wave', 'nod', 'tpose']
let currentAnimationIndex = 0

// Performance optimization: frame skipping
let frameSkipCount = 0
let frameSkipThreshold = 1 // Render every frame by default
let lastFpsCheck = 0
let frameCount = 0
let currentFps = 60
let isVisible = false // Track visibility for pausing

// Initialize Three.js scene
const initThreeJS = async () => {
  if (!canvasRef.value) return
  
  await loadThreeJS()
  if (disposed) return

  // Wait for container to have dimensions
  await new Promise((resolve) => {
    finishDimensionWait = resolve
    const checkDimensions = () => {
      if (disposed || (canvasRef.value && canvasRef.value.clientWidth > 0 && canvasRef.value.clientHeight > 0)) {
        finishDimensionWait = null
        dimensionFrameId = null
        resolve()
      } else {
        dimensionFrameId = requestAnimationFrame(checkDimensions)
      }
    }
    checkDimensions()
  })
  if (disposed) return

  // Scene
  scene = new THREE.Scene()
  scene.background = null

  // Camera - 90 degrees straight on, no tilt
  const width = canvasRef.value.clientWidth
  const height = canvasRef.value.clientHeight
  const aspect = width / height
  camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000)
  camera.position.set(0, 0, 3) // y=0 for no vertical tilt
  camera.lookAt(0, 0, 0) // Look straight at center

  // Detect device capabilities
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  const isLowEndDevice = navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4
  
  // Renderer
  renderer = new THREE.WebGLRenderer({
    canvas: canvasRef.value,
    alpha: true,
    antialias: !isLowEndDevice, // Disable antialiasing on low-end devices
    powerPreference: 'high-performance'
  })
  renderer.setSize(width, height)
  
  // Optimize pixel ratio: reduce from 2 to 1.5 max, 1 on mobile
  const pixelRatio = isMobile ? 1 : Math.min(window.devicePixelRatio, 1.5)
  renderer.setPixelRatio(pixelRatio)
  renderer.outputColorSpace = THREE.SRGBColorSpace

  // Lighting - Brighter setup
  const ambientLight = new THREE.AmbientLight(0xffffff, 1.2) // Increased from 0.7 to 1.2
  scene.add(ambientLight)

  const mainLight = new THREE.DirectionalLight(0xffffff, 1.5) // Increased from 1.0 to 1.5
  mainLight.position.set(2, 3, 4)
  scene.add(mainLight)

  const fillLight = new THREE.DirectionalLight(0xffffff, 0.8) // Increased from 0.5 to 0.8
  fillLight.position.set(-3, 1, 2)
  scene.add(fillLight)

  const rimLight = new THREE.DirectionalLight(0xffffff, 0.6) // Increased from 0.3 to 0.6
  rimLight.position.set(0, 1, -3)
  scene.add(rimLight)

  // Additional front light for more brightness
  const frontLight = new THREE.DirectionalLight(0xffffff, 0.7)
  frontLight.position.set(0, 0, 5)
  scene.add(frontLight)

  // GLTF Loader
  loader = new GLTFLoader()
  
  // Load avatar
  await loadAvatar()
}

// Load avatar model
const loadAvatar = async () => {
  if (disposed || !loader || !props.avatarUrl) return
  const loadId = ++avatarLoadId
  
  isLoading.value = true
  
  try {
    const gltf = await new Promise((resolve, reject) => {
      loader.load(
        props.avatarUrl,
        resolve,
        undefined,
        reject
      )
    })
    
    const avatarModel = gltf.scene
    if (disposed || loadId !== avatarLoadId) {
      disposeModel(avatarModel)
      return
    }
    
    // Scale and center avatar
    const box = new THREE.Box3().setFromObject(avatarModel)
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    const scale = 1.8 / maxDim
    avatarModel.scale.setScalar(scale)
    
    const center = box.getCenter(new THREE.Vector3())
    avatarModel.position.sub(center.multiplyScalar(scale))
    
    // Create container group
    const avatarGroup = new THREE.Group()
    avatarGroup.add(avatarModel)
    avatarGroup.position.set(0, 0, 0)
    
    // Store model reference for animations
    avatarGroup.userData = {
      model: avatarModel
    }
    
    scene.add(avatarGroup)
    avatar = avatarGroup
    
    // Save original bone states
    originalBoneStates = saveOriginalBoneStates(avatarModel)
    
    // Save original model state (position, rotation, scale)
    originalModelState = {
      position: avatarModel.position.clone(),
      rotation: avatarModel.rotation.clone(),
      scale: avatarModel.scale.clone()
    }
    
    isLoading.value = false
    startAnimationLoop()
  } catch (error) {
    if (disposed || loadId !== avatarLoadId) return
    console.error('Failed to load avatar:', error)
    isLoading.value = false
  }
}

// Bone finding functions
const findBones = (model) => {
  const bones = {
    leftArm: null,
    rightArm: null,
    leftHand: null,
    rightHand: null,
    head: null,
    spine: null,
    hips: null,
    leftLeg: null,
    rightLeg: null,
  }
  
  model.traverse((child) => {
    if (child.isBone || child.type === 'Bone') {
      const name = child.name.toLowerCase()
      
      if (name.includes('left') && (name.includes('arm') || name.includes('shoulder') || name.includes('upper'))) {
        bones.leftArm = child
      }
      if (name.includes('right') && (name.includes('arm') || name.includes('shoulder') || name.includes('upper'))) {
        bones.rightArm = child
      }
      if (name.includes('left') && name.includes('hand')) {
        bones.leftHand = child
      }
      if (name.includes('right') && name.includes('hand')) {
        bones.rightHand = child
      }
      if (name.includes('head') || name.includes('neck')) {
        bones.head = child
      }
      if (name.includes('spine') || name.includes('chest')) {
        bones.spine = child
      }
      if (name.includes('hips') || name.includes('pelvis')) {
        bones.hips = child
      }
      if (name.includes('left') && (name.includes('leg') || name.includes('thigh'))) {
        bones.leftLeg = child
      }
      if (name.includes('right') && (name.includes('leg') || name.includes('thigh'))) {
        bones.rightLeg = child
      }
    }
  })
  
  return bones
}

// Save original bone states
const saveOriginalBoneStates = (model) => {
  const states = new Map()
  model.traverse((child) => {
    if (child.isBone || child.type === 'Bone') {
      states.set(child, {
        position: child.position.clone(),
        rotation: child.rotation.clone(),
        quaternion: child.quaternion.clone(),
      })
    }
  })
  return states
}

// Restore original bone states
const restoreOriginalBoneStates = (model, states) => {
  model.traverse((child) => {
    if (states.has(child)) {
      const original = states.get(child)
      child.position.copy(original.position)
      child.rotation.copy(original.rotation)
      child.quaternion.copy(original.quaternion)
    }
  })
}

// Smooth easing functions
const easeInOutCubic = (t) => {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

const easeOutCubic = (t) => {
  return 1 - Math.pow(1 - t, 3)
}

const easeInOutSine = (t) => {
  return -(Math.cos(Math.PI * t) - 1) / 2
}

// Animation functions with smoother interpolation
const animateWave = (model, progress) => {
  const bones = findBones(model)
  const smoothProgress = easeInOutSine(progress)
  if (bones.rightArm) {
    const waveAngle = Math.sin(smoothProgress * Math.PI * 4) * 0.3
    const liftAngle = easeInOutCubic(progress) * Math.PI / 2
    bones.rightArm.rotation.z = -liftAngle - 0.5
    bones.rightArm.rotation.x = waveAngle
  }
  if (bones.rightHand) {
    const handWave = Math.sin(smoothProgress * Math.PI * 4) * 0.5
    bones.rightHand.rotation.z = handWave
  }
}

const animateJump = (model, progress) => {
  const smoothProgress = easeInOutCubic(progress)
  const jumpHeight = Math.sin(smoothProgress * Math.PI) * 0.5
  model.position.y = jumpHeight
  const crouchAmount = Math.cos(smoothProgress * Math.PI * 2) * 0.1
  model.scale.y = 1 + crouchAmount
  model.scale.x = 1 - crouchAmount * 0.5
  model.scale.z = 1 - crouchAmount * 0.5
  const bones = findBones(model)
  if (bones.leftLeg) {
    bones.leftLeg.rotation.x = Math.max(0, -crouchAmount * 2)
  }
  if (bones.rightLeg) {
    bones.rightLeg.rotation.x = Math.max(0, -crouchAmount * 2)
  }
}

const animateNod = (model, progress) => {
  const bones = findBones(model)
  const smoothProgress = easeInOutSine(progress)
  if (bones.head) {
    const nodAngle = Math.sin(smoothProgress * Math.PI * 6) * 0.3
    bones.head.rotation.x = nodAngle
  }
}

const animateTPose = (model, progress) => {
  const bones = findBones(model)
  // Smooth easing in and out
  let easeProgress
  if (progress < 0.3) {
    easeProgress = easeOutCubic(progress / 0.3)
  } else if (progress > 0.7) {
    easeProgress = easeOutCubic((1 - progress) / 0.3)
  } else {
    easeProgress = 1
  }
  if (bones.leftArm) {
    bones.leftArm.rotation.z = easeProgress * Math.PI / 2
  }
  if (bones.rightArm) {
    bones.rightArm.rotation.z = -easeProgress * Math.PI / 2
  }
}

const animateBounce = (model, progress) => {
  const bones = findBones(model)
  const smoothProgress = easeInOutSine(progress)
  const breathe = Math.sin(smoothProgress * Math.PI * 4) * 0.02
  if (bones.spine) {
    bones.spine.scale.y = 1 + breathe
  }
  const sway = Math.sin(smoothProgress * Math.PI * 2) * 0.1
  model.rotation.z = sway * 0.05
  const bounce = Math.sin(smoothProgress * Math.PI * 4) * 0.05
  model.position.y = bounce
}

// Execute animation
const executeAnimation = (model, animationType, progress) => {
  switch (animationType) {
    case 'wave':
      animateWave(model, progress)
      break
    case 'jump':
      animateJump(model, progress)
      break
    case 'nod':
      animateNod(model, progress)
      break
    case 'tpose':
      animateTPose(model, progress)
      break
    case 'bounce':
      animateBounce(model, progress)
      break
  }
}

// Animation loop with frame skipping
const startAnimationLoop = () => {
  const animate = () => {
    if (disposed) return
    animationFrameId = requestAnimationFrame(animate)
    
    // Skip rendering if not visible
    if (!isVisible || !props.autoRotate) {
      return
    }
    
    // Frame skipping for performance
    frameSkipCount++
    if (frameSkipCount < frameSkipThreshold) {
      return
    }
    frameSkipCount = 0
    
    // FPS monitoring (check every 60 frames)
    frameCount++
    const now = performance.now()
    if (now - lastFpsCheck >= 1000) {
      currentFps = frameCount
      frameCount = 0
      lastFpsCheck = now
      
      // Adjust frame skip based on FPS
      if (currentFps < 30) {
        frameSkipThreshold = 2 // Skip every other frame if FPS < 30
      } else if (currentFps < 45) {
        frameSkipThreshold = 1.5 // Skip occasionally if FPS < 45
      } else {
        frameSkipThreshold = 1 // Render every frame if FPS >= 45
      }
    }
    
    if (avatar && avatar.userData.model) {
      const model = avatar.userData.model
      const currentTime = performance.now()
      
      // Handle avatar animations
      if (isAnimating && currentAnimationType) {
        const elapsed = currentTime - animationStartTime
        const progress = Math.min(elapsed / animationDuration, 1)
        
        executeAnimation(model, currentAnimationType, progress)
        
        // Animation finished
        if (progress >= 1) {
          stopAnimation()
        }
      }
      
      // Auto-rotate (only if not paused)
      // Start from front-facing position (rotation.y = 0) when resuming
      if (!isRotationPaused) {
        // If rotation is close to 0, ensure we start from front
        if (Math.abs(avatar.rotation.y) < 0.01) {
          avatar.rotation.y = 0
        }
        avatar.rotation.y += autoRotateSpeed
        
        // Faster rotation on hover (desktop only)
        if (!isMobile.value && isHovering.value) {
          avatar.rotation.y += autoRotateSpeed * 2
        }
      }
      
      renderer.render(scene, camera)
    }
  }
  
  animate()
}

// Stop animation and restore state
const stopAnimation = () => {
  if (!avatar || !avatar.userData.model) return
  
  const model = avatar.userData.model
  
  // Restore original bone states
  if (originalBoneStates) {
    restoreOriginalBoneStates(model, originalBoneStates)
  }
  
  // Reset model transforms to original state
  if (originalModelState) {
    model.position.copy(originalModelState.position)
    model.rotation.copy(originalModelState.rotation)
    model.scale.copy(originalModelState.scale)
  } else {
    // Fallback if original state not saved
    model.position.set(0, 0, 0)
    model.rotation.set(0, 0, 0)
    model.scale.set(1, 1, 1)
  }
  
  // Also ensure avatar group position is reset
  if (avatar) {
    avatar.position.set(0, 0, 0)
  }
  
  // Reset animation state
  isAnimating = false
  currentAnimationType = null
  
  // Ensure avatar is facing front before resuming rotation
  avatar.rotation.y = 0
  
  // Resume rotation after 3 seconds (starting from front)
  setTimeout(() => {
    // Double-check rotation is reset to front
    avatar.rotation.y = 0
    isRotationPaused = false
  }, 3000)
}

// Handle click - face front and play animation
const handleClick = () => {
  if (!avatar || !avatar.userData.model || isAnimating) return
  
  const model = avatar.userData.model
  
  // Stop rotation and face front
  isRotationPaused = true
  avatar.rotation.y = 0 // Face front (90 degrees - no tilt)
  
  // Select and start animation
  currentAnimationType = ANIMATION_TYPES[currentAnimationIndex]
  currentAnimationIndex = (currentAnimationIndex + 1) % ANIMATION_TYPES.length
  
  isAnimating = true
  animationStartTime = performance.now()
  
  console.log(`🎭 Avatar action: ${currentAnimationType}`)
}

// Handle resize
const handleResize = () => {
  if (!canvasRef.value || !camera || !renderer) return
  
  const width = canvasRef.value.clientWidth
  const height = canvasRef.value.clientHeight
  
  // Don't resize if dimensions are invalid
  if (width <= 0 || height <= 0) return
  
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  renderer.setSize(width, height)
}

// Watch autoRotate prop to start/stop rotation
watch(() => props.autoRotate, (shouldRotate) => {
  if (avatar) {
    isRotationPaused = !shouldRotate
    isVisible = shouldRotate // Update visibility state
    if (shouldRotate && Math.abs(avatar.rotation.y) < 0.01) {
      avatar.rotation.y = 0 // Reset to front when starting rotation
    }
  }
})

// IntersectionObserver to pause when not visible
onMounted(() => {
  if (containerRef.value) {
    visibilityObserver = new IntersectionObserver(
      (entries) => {
        if (disposed) return
        entries.forEach((entry) => {
          isVisible = entry.isIntersecting && props.autoRotate
        })
      },
      {
        threshold: 0.1,
        rootMargin: '50px'
      }
    )
    visibilityObserver.observe(containerRef.value)
    
    // Add ResizeObserver to handle container size changes
    resizeObserver = new ResizeObserver(() => {
      if (disposed) return
      // Debounce resize handling
      clearTimeout(resizeTimeout)
      resizeTimeout = setTimeout(() => {
        handleResize()
      }, 100)
    })
    resizeObserver.observe(containerRef.value)
    
    // Initial resize after a short delay to ensure container has rendered
    initialResizeTimeout = setTimeout(() => {
      handleResize()
    }, 100)
  }
})

// Dispose resources owned by this model, including late loader results.
const disposeModel = (model) => {
  const resources = new Set()
  model.traverse((child) => {
    if (!child.isMesh) return
    if (child.geometry) resources.add(child.geometry)
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    for (const material of materials) {
      if (!material) continue
      resources.add(material)
      for (const value of Object.values(material)) {
        if (value?.isTexture) resources.add(value)
      }
    }
  })
  resources.forEach(resource => resource.dispose())
}

// A model change must retain the renderer; unmount disposes it separately.
const cleanupAvatar = () => {
  avatarLoadId++
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }
  
  if (avatar) {
    disposeModel(avatar)
    scene.remove(avatar)
    avatar = null
  }
  
  originalBoneStates = null
  originalModelState = null
  isAnimating = false
}

// Watch for avatar URL changes
watch(() => props.avatarUrl, async (newUrl) => {
  if (!disposed && loader) {
    cleanupAvatar()
    if (newUrl) await loadAvatar()
  }
})

onMounted(async () => {
  checkMobile() // Check if mobile on mount
  window.addEventListener('resize', checkMobile) // Re-check on resize
  
  await initThreeJS()
  if (disposed) return
  window.addEventListener('resize', handleResize)
  
  // Set initial visibility based on autoRotate prop
  isVisible = props.autoRotate
})

onBeforeUnmount(() => {
  disposed = true
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('resize', checkMobile)
  
  visibilityObserver?.disconnect()
  resizeObserver?.disconnect()
  clearTimeout(resizeTimeout)
  clearTimeout(initialResizeTimeout)
  if (dimensionFrameId) cancelAnimationFrame(dimensionFrameId)
  finishDimensionWait?.()
  finishDimensionWait = null
  cleanupAvatar()
  renderer?.dispose()
  renderer = null
})
</script>

<style scoped>
.single-avatar-container {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-height: 100%;
}

.avatar-canvas {
  cursor: pointer;
  outline: none;
  width: 100%;
  height: 100%;
  min-height: 100%;
  display: block;
  filter: brightness(1.1);
}

/* Disable pointer cursor and interaction on mobile */
@media (max-width: 767px) {
  .avatar-canvas {
    cursor: default;
    pointer-events: none;
  }
}

.spinner-modern {
  width: 48px;
  height: 48px;
  border: 4px solid #f3f4f6;
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
