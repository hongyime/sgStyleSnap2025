<template>
  <!-- Apple-style Splash Screen -->
  <Transition name="splash-fade">
    <div 
      v-if="showSplash" 
      class="splash-screen"
      :class="{ 'splash-transitioning': isTransitioning, 'splash-fading': splashFading }"
    >
    <h1 
      class="splash-title" 
      :class="{ 'splash-title-moving': isTransitioning, 'splash-title-frozen': animationComplete }"
      :style="isTransitioning || animationComplete ? {
        '--target-x': `${splashTransform.x}px`,
        '--target-y': `${splashTransform.y}px`,
        transform: `translate(var(--target-x), var(--target-y))`,
        fontWeight: 700
      } : {}"
    >
      {{ displayedTitle }}<span v-if="showTypewriterCursor" class="typewriter-cursor-splash">|</span>
    </h1>
    
    <!-- Skip Animation Button -->
    <button
      v-if="!isTransitioning && !animationComplete"
      @click="skipAnimation"
      class="skip-animation-btn group"
      title="Skip animation"
    >
      <span>Skip Animation</span>
      <ArrowRight class="w-5 h-5 text-black group-hover:translate-x-1 transition" style="color: #000000 !important; stroke: #000000 !important;" />
    </button>
    </div>
  </Transition>

  <div 
    class="min-h-screen bg-white text-gray-900 landing-page"
    :class="{ 'page-hidden': !isTransitioning && showSplash, 'page-visible': isTransitioning || !showSplash }"
  >
    <!-- Navigation - Floating Pill Header (Always Visible) -->
    <nav class="fixed top-4 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 landing-nav-pill">
      <div class="flex items-center justify-between gap-4 py-2.5 px-6 md:px-5 rounded-full bg-gray-100/70 backdrop-blur-md border border-gray-200/50 shadow-lg landing-nav-container">
        <!-- Logo and Brand -->
        <div 
          @click="scrollToTop"
          class="flex items-center gap-2 min-w-0 flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
        >
          <StyleSnapLogo size="base" />
          <StyleSnapBrand class="font-bold text-base truncate text-gray-900" size="base" />
        </div>

        <!-- Desktop Menu and Auth Buttons - Right Side -->
        <div class="flex items-center gap-2 flex-shrink-0 ml-8 md:ml-12">
          <!-- Desktop Menu -->
          <div class="hidden md:flex items-center gap-6">
            <a href="#demo" class="text-sm font-medium text-gray-900 hover:text-gray-600 transition">Demo</a>
          </div>
        
          <button
            @click="handleLogin"
            class="hidden md:inline-flex items-center justify-center text-sm font-medium text-gray-900 hover:text-gray-600 transition px-3 py-1.5"
          >
            Log In
          </button>
          <button
            @click="handleSignUp"
            :class="`join-for-free-btn inline-flex items-center justify-center bg-black text-white hover:bg-gray-900 py-1.5 rounded-full font-medium text-sm shadow-md hover:shadow-lg overflow-hidden ${
              showJoinButton 
                ? 'join-button-enter' 
                : 'join-button-exit'
            }`"
            style="color: #ffffff !important;"
          >
            <span class="whitespace-nowrap !text-white" style="color: #ffffff !important;">Join for free</span>
          </button>

          <!-- Mobile Menu Button -->
          <button
            class="md:hidden flex items-center justify-center px-3 py-2"
            :aria-label="isMenuOpen ? 'Close menu' : 'Open menu'"
            :aria-expanded="isMenuOpen"
            aria-controls="landing-mobile-menu"
            @click="isMenuOpen = !isMenuOpen"
          >
            <X v-if="isMenuOpen" class="w-5 h-5 text-gray-900" />
            <Menu v-else class="w-5 h-5 text-gray-900" />
          </button>
        </div>
      </div>
      
      <!-- Mobile Menu -->
      <div v-if="isMenuOpen" id="landing-mobile-menu" class="md:hidden mt-2 rounded-xl bg-gray-100/70 backdrop-blur-md border border-gray-200/50 shadow-lg animate-slideInDown">
        <div class="py-4 px-4 flex flex-col gap-3">
          <a href="#demo" @click="isMenuOpen = false" class="text-sm font-medium text-gray-900 hover:text-gray-600 transition py-2">Demo</a>
          <button
            @click="handleLogin"
            class="text-left text-sm font-medium text-gray-900 hover:text-gray-600 transition py-2"
          >
            Log In
          </button>
        </div>
      </div>
    </nav>

    <!-- Hero Section -->
    <section 
      ref="heroSectionRef"
      class="hero-section relative overflow-hidden min-h-screen flex items-center justify-center"
      :style="heroBackgroundStyle"
    >
      <!-- Overlay for better text readability -->
      <div class="absolute inset-0 bg-black/20"></div>

      <!-- Centered content -->
      <div class="container relative z-10 text-center flex flex-col items-center">
        <h1 
          ref="heroTitleRef"
          class="hero-title text-white mb-3 sm:mb-5"
          :class="{ 'hero-title-visible': showHeroTitle }"
        >
          Transform Your Fashion Game
        </h1>
        <p class="text-lg md:text-xl text-white max-w-2xl mx-auto mb-6 sm:mb-8" style="color: #ffffff !important;">
          Organise your closet, create stunning outfits, and discover new styles with AI-powered suggestions. Share your fashion journey with friends.
        </p>
        <div class="flex justify-center">
          <button
            @click="handleSignUp"
            class="flex items-center gap-2 px-5 py-2.5 rounded-full font-medium transition-all duration-200 hover:scale-105"
            style="background-color: #ffffff !important; color: #000000 !important;"
          >
            <span style="color: #000000 !important;">Sign Up Now</span>
            <ArrowRight class="w-4 h-4 group-hover:translate-x-1 transition" style="color: #000000 !important; stroke: #000000 !important;" />
          </button>
        </div>
      </div>
    </section>
    
    <!-- Features Section -->
    <section id="features" class="landing-section py-[8vh] bg-white relative overflow-hidden">
      <div class="container relative z-10">
        <div class="text-center mb-6 sm:mb-12 scroll-hidden animate-slideInFromBottom" id="features-header">
          <h2 class="text-3xl font-bold mb-1 sm:mb-2">
            Powerful Features<span class="md:hidden"><br /></span> for Your Style
          </h2>
          <p class="text-lg md:text-xl text-gray-600 max-w-2xl mx-auto">
            Everything you need to <span class="md:hidden"><br /></span>manage, create, and share <span class="md:hidden"><br /></span>your fashion effortlessly
          </p>
        </div>
          
        <!-- 3D Carousel Container -->
        <div 
          ref="carouselWrapperRef"
          class="carousel-3d-wrapper"
          :class="{ 'carousel-active': isCarouselActive }"
        >
          <div 
            class="carousel-3d-container"
            :style="{ transform: `translate3d(0, 0, 0) rotateY(${carouselRotation}deg)` }"
          >
            <div
              v-for="(feature, idx) in features"
              :key="feature.id"
              class="carousel-3d-item"
              :class="{ 
                'expanded': feature.expanded,
                'front-facing': isCardFrontFacing(idx)
              }"
              :style="{
                transform: `translate3d(0, 0, 0) rotateY(${idx * (360 / features.length)}deg) translateZ(220px)`,
                '--item-index': idx
              }"
              @mouseenter="handleCardHover(idx, feature.id)"
              @mouseleave="handleCardHoverLeave(feature.id)"
            >
              <div 
                class="carousel-card-wrapper"
                :class="{ 'flipped': feature.flipped }"
              >
                <!-- Front Face -->
                <div class="carousel-card-face carousel-card-front bg-white rounded-xl border-2 border-gray-300 p-4 sm:p-5 shadow-lg min-h-full flex flex-col">
                  <div class="flex flex-col items-center justify-center text-center space-y-2 sm:space-y-2.5 flex-1" :class="{ 'mb-0': frontFacingCardIndex === idx, 'mb-auto': frontFacingCardIndex !== idx }">
                    <component 
                      :is="feature.icon" 
                      class="w-8 h-8 sm:w-10 sm:h-10 text-gray-900 flex-shrink-0 transition-opacity duration-300"
                      :style="{ opacity: isCardFrontFacing(idx) ? 1 : 0.3 }"
                    />
                    <h3 
                      class="text-base sm:text-lg font-bold flex-shrink-0 transition-opacity duration-300"
                      :style="{ opacity: isCardFrontFacing(idx) ? 1 : 0.3 }"
                    >{{ feature.title }}</h3>
                  </div>
                  <!-- Hover indicator - only show on front-facing cards -->
                  <div class="flex flex-col items-center justify-center pt-2 pb-1 h-8 transition-all duration-300">
                    <Transition name="fade-in">
                      <div 
                        v-show="frontFacingCardIndex === idx"
                        class="flex flex-col items-center justify-center"
                      >
                        <span class="text-xs text-gray-500 mt-0.5 text-center">
                          <span class="hidden md:inline">Hover over me to find out more</span>
                          <span class="md:hidden">Tap me to find out more</span>
                        </span>
                      </div>
                    </Transition>
                  </div>
                </div>
                
                <!-- Back Face -->
                <div class="carousel-card-face carousel-card-back bg-white rounded-xl border-2 border-gray-300 p-4 sm:p-5 shadow-lg min-h-full flex flex-col">
                  <div class="flex flex-col items-center text-center space-y-3 sm:space-y-4 flex-1 justify-center">
                    <p class="text-xs sm:text-sm text-gray-900 leading-relaxed" style="color: #000000 !important;">
                      {{ feature.expandedDescription }}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Carousel Slider -->
        <div class="mt-8 flex flex-col items-center gap-3 w-full max-w-md mx-auto px-4">
          <input
            type="range"
            :value="sliderValue"
            :min="0"
            :max="360"
            step="1"
            class="carousel-slider w-full"
            @input="updateCarouselRotation"
            @mouseup="snapOnRelease"
            @touchend="snapOnRelease"
          />
          <p class="text-xs text-gray-500">Drag / Arrow Keys to rotate Carousel</p>
        </div>
      </div>
    </section>
    
    <!-- Demo Section -->
    <section id="demo" class="landing-section py-[8vh] relative overflow-hidden bg-white">
      <div class="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div class="text-center mb-6 sm:mb-12 scroll-hidden animate-slideInFromBottom" id="demo-header">
          <h2 class="text-3xl font-bold mb-1 sm:mb-2">Try the Outfit Creator</h2>
          <p class="text-lg md:text-xl text-gray-600 max-w-2xl mx-auto">
            Click items to add them, then drag to adjust positions in your outfit
          </p>
        </div>
        
        <div class="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-6 lg:gap-6">
          <!-- Left Sidebar - Catalogue Items -->
          <div class="lg:col-span-2">
            <div class="rounded-xl p-4 sm:p-6 bg-white border border-gray-200" style="height: 500px; display: flex; flex-direction: column;">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-base sm:text-lg font-bold">Catalogue</h3>
                <span class="text-xs sm:text-sm px-2 py-1 rounded-full bg-gray-100 text-gray-600">
                  {{ filteredCatalogueItems.length }}
                  <span v-if="displayedItemsCount.value < filteredCatalogueItems.length">
                    ({{ displayedItemsCount.value }} shown)
                  </span>
                </span>
              </div>
              
              <!-- Category Filters -->
              <div v-if="catalogueItems.length > 0" class="flex flex-wrap gap-2 mb-4">
                <button
                  v-for="category in availableCategories"
                  :key="category"
                  @click="activeCategory = category"
                  :class="`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                    activeCategory === category
                      ? 'bg-black text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-800'
                  }`"
                >
                  {{ category === 'all' ? 'All' : category.charAt(0).toUpperCase() + category.slice(1) }}
                </button>
              </div>

              <!-- Items List -->
              <div 
                ref="catalogueScrollRef"
                class="space-y-2 overflow-y-auto px-2 custom-scrollbar flex-1"
                style="min-height: 0;"
                @scroll="handleCatalogueScroll"
              >
                <div
                  v-if="loadingCatalogue"
                  class="text-center py-8 text-gray-500"
                >
                  Loading items...
                </div>
                <div
                  v-else-if="filteredCatalogueItems.length === 0"
                  class="text-center py-8 text-gray-500"
                >
                  <Shirt class="w-8 h-8 mx-auto mb-2 text-gray-400" />
                  <p class="text-sm">No items available</p>
                </div>
                <div
                  v-else
                  v-for="item in displayedCatalogueItems"
                  :key="item.id"
                  v-memo="[item.id, item.name, item.image_url, item.category, activeCategory]"
                  draggable="true"
                  @dragstart="handleCatalogDragStart(item, $event)"
                  @click="addCatalogueItemToCanvas(item)"
                  class="group p-3 rounded-xl cursor-grab active:cursor-grabbing transition-all duration-200 hover:scale-[1.02] bg-gray-50 hover:bg-gray-100 border border-gray-200 hover:border-gray-300"
                >
                  <div class="flex items-center gap-3">
                    <!-- Item Image -->
                    <div class="w-12 h-12 sm:w-14 sm:h-14 rounded-lg overflow-hidden flex-shrink-0 shadow-sm bg-white">
                      <ClothingImage
                        v-if="item.image_url || item.thumbnail_url"
                        :record="item" table="catalog_items" :src="item.thumbnail_url || item.image_url"
                        :alt="item.name"
                        class="w-full h-full object-cover"
                        loading="lazy"
                        draggable="false"
                      />
                      <div v-else class="w-full h-full flex items-center justify-center bg-gray-100">
                        <Shirt class="w-6 h-6 text-gray-400" />
                      </div>
                    </div>
                    
                    <!-- Item Info -->
                    <div class="flex-1 min-w-0">
                      <p class="text-xs sm:text-sm font-medium truncate mb-1 text-gray-900">
                        {{ item.name }}
                      </p>
                      <p class="text-xs truncate capitalize text-gray-500">
                        {{ item.category }}
                      </p>
                    </div>
                    
                    <!-- Add Icon -->
                    <div class="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-gray-500">
                      <Plus class="w-4 h-4 sm:w-5 sm:h-5" />
                    </div>
                  </div>
                </div>
                <!-- Load More Indicator -->
                <div
                  v-if="!loadingCatalogue && displayedItemsCount.value < filteredCatalogueItems.length"
                  class="text-center py-4"
                >
                  <button
                    @click="loadMoreItems"
                    class="text-xs text-gray-500 hover:text-gray-700 transition"
                  >
                    Load more ({{ filteredCatalogueItems.length - displayedItemsCount.value }} remaining)
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Right Area - Outfit Canvas -->
          <div class="lg:col-span-3">
            <div class="rounded-xl overflow-hidden bg-white border border-gray-200">
              <!-- Canvas Area -->
              <div
                ref="canvasRef"
                class="relative w-full rounded-lg overflow-hidden bg-gray-50"
                style="height: 500px;"
                @drop="handleDrop"
                @dragover.prevent
                @dragenter.prevent
                @click="selectedItemId = null"
                @mousemove="handleMouseMove"
                @mouseup="handleMouseUp"
                @mouseleave="handleMouseUp"
              >
                <!-- Grid Background -->
                <div
                  v-if="showGrid"
                  class="absolute inset-0 opacity-20 pointer-events-none"
                  style="z-index: 1;"
                  :style="{
                    backgroundImage: `
                      linear-gradient(#000000 1px, transparent 1px),
                      linear-gradient(90deg, #000000 1px, transparent 1px)
                    `,
                    backgroundSize: '40px 40px'
                  }"
                />
                
              <template v-if="outfitItems.length > 0">
                <div
                  v-for="item in outfitItems"
                  :key="item.id"
                  :title="`${item.name}${item.category ? ` - ${item.category.charAt(0).toUpperCase() + item.category.slice(1)}` : ''}`"
                  :class="[
                    'absolute group select-none',
                    draggedItem === item.id ? 'cursor-grabbing' : 'cursor-grab',
                    {
                      'ring-4 ring-blue-500 ring-offset-2': selectedItemId === item.id
                    }
                  ]"
                  :style="{
                    position: 'absolute',
                    left: `${item.x}px`,
                    top: `${item.y}px`,
                    zIndex: draggedItem === item.id ? 50 : Math.max(2, (item.z_index || 0)) + (selectedItemId === item.id ? 1000 : 0),
                    transform: `rotate(${item.rotation || 0}deg) scale(${item.scale || 1})`,
                    transformOrigin: 'center center',
                    transition: draggedItem === item.id ? 'none' : 'all 0.2s'
                  }"
                  @mousedown.stop="handleMouseDown(item, $event)"
                  @touchstart.stop.prevent="handleTouchStart(item, $event)"
                  @click.stop="selectItem(item.id)"
                >
                  <div class="w-32 h-32 overflow-hidden">
                    <ClothingImage
                      v-if="item.image_url || item.thumbnail_url"
                      :record="item" table="catalog_items" :src="item.thumbnail_url || item.image_url"
                      :alt="item.name"
                      class="w-full h-full object-contain"
                      loading="lazy"
                      draggable="false"
                    />
                    <div v-else class="w-full h-full flex items-center justify-center bg-gray-200">
                      <Shirt class="w-12 h-12 text-gray-400" />
                    </div>
                  </div>
              
                  <!-- Toolkit (shown when selected) -->
                  <div
                    v-if="selectedItemId === item.id"
                    class="absolute -top-14 left-1/2 -translate-x-1/2 flex gap-0.5 p-1.5 rounded-lg shadow-lg backdrop-blur-sm bg-white/95 border border-gray-200 opacity-100 transition-opacity duration-200 z-[100] pointer-events-auto"
                    @mousedown.stop
                    @click.stop
                  >
                <!-- Zoom Out -->
                <button
                  @click.stop="scaleSelectedItem(-0.1)"
                  class="rounded h-7 w-7 transition-colors hover:bg-gray-100"
                  title="Zoom Out"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mx-auto">
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="m21 21-4.35-4.35"></path>
                    <line x1="8" y1="11" x2="14" y2="11"></line>
                  </svg>
                </button>

                <!-- Zoom In -->
                <button
                  @click.stop="scaleSelectedItem(0.1)"
                  class="rounded h-7 w-7 transition-colors hover:bg-gray-100"
                  title="Zoom In"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mx-auto">
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="m21 21-4.35-4.35"></path>
                    <line x1="11" y1="8" x2="11" y2="14"></line>
                    <line x1="8" y1="11" x2="14" y2="11"></line>
                  </svg>
                </button>

                <!-- Rotate Left -->
                <button
                  @click.stop="rotateSelectedItem(-15)"
                  class="rounded h-7 w-7 transition-colors hover:bg-gray-100"
                  title="Rotate Left"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mx-auto">
                    <path d="M2.5 2v6h6M2.66 15.57a10 10 0 1 0 .57-8.38"></path>
                  </svg>
                </button>

                <!-- Rotate Right -->
                <button
                  @click.stop="rotateSelectedItem(15)"
                  class="rounded h-7 w-7 transition-colors hover:bg-gray-100"
                  title="Rotate Right"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mx-auto">
                    <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38"></path>
                  </svg>
                </button>

                <!-- Move Forward -->
                <button
                  @click.stop="moveSelectedItemForward"
                  class="rounded h-7 w-7 transition-colors hover:bg-gray-100"
                  title="Move Forward"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mx-auto">
                    <polyline points="18 15 12 9 6 15"></polyline>
                  </svg>
                </button>

                <!-- Move Backward -->
                <button
                  @click.stop="moveSelectedItemBackward"
                  class="rounded h-7 w-7 transition-colors hover:bg-gray-100"
                  title="Move Backward"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mx-auto">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </button>

                <!-- Delete -->
                <button
                  @click.stop="deleteSelectedItem"
                  class="rounded h-7 w-7 transition-colors hover:bg-red-200 text-red-600"
                  title="Delete"
                >
                  <Trash2 class="w-3.5 h-3.5 mx-auto" />
                </button>
              </div>
                </div>
              </template>
              <template v-else>
                <!-- Empty State -->
                <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <div class="w-24 h-24 rounded-full flex items-center justify-center mb-6 bg-gray-200">
                    <Sparkles class="w-12 h-12 text-stone-500 dark:text-zinc-400" />
                  </div>
                  <p class="text-lg font-medium mb-2 text-gray-700">
                    Start Creating Your Outfit
                  </p>
                  <p class="text-sm text-gray-500">
                    Click on items from the left to add them to the canvas
                  </p>
                </div>
              </template>

                <!-- Bottom-Center Canvas Toolbar -->
                <div class="absolute left-1/2 -translate-x-1/2 bottom-4 z-20 flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-gray-200 shadow-sm backdrop-blur dark:bg-white dark:border-gray-200">
                  <button
                    @click="toggleGrid"
                    :class="`p-2 rounded-lg transition-all ${
                      showGrid
                        ? 'bg-black text-white dark:bg-black dark:text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-100 dark:text-gray-700 dark:hover:bg-gray-200'
                    }`"
                    title="Toggle Grid"
                  >
                    <Grid3X3 class="w-4 h-4" />
                  </button>
                  <button
                    @click="clearOutfit"
                    :disabled="outfitItems.length === 0"
                    :class="`p-2 rounded-lg transition-all ${
                      outfitItems.length > 0
                        ? 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-100 dark:text-gray-700 dark:hover:bg-gray-200'
                        : 'opacity-50 cursor-not-allowed'
                    }`"
                    title="Clear Canvas"
                  >
                    <Trash2 class="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Why Choose Section -->
    <section id="why" class="landing-section py-[8vh] bg-white relative overflow-hidden">
      <div class="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <!-- Centered Title -->
        <div class="text-center mb-6 sm:mb-10 scroll-hidden animate-slideInFromBottom" id="why-content">
          <h2 class="text-3xl font-bold mb-5 sm:mb-6">Why Choose StyleSnap?</h2>
        </div>

        <!-- Avatar and Cards Layout -->
        <div class="flex flex-col md:flex-row gap-6 sm:gap-8 items-stretch">
          <!-- 3D Avatar on Left -->
          <div class="w-full md:w-1/2 order-2 md:order-1" ref="avatarSectionRef">
            <div class="w-full h-full flex items-center justify-center" style="min-height: 100%;">
              <SingleAvatar3D :avatar-url="selectedAvatarUrl" :auto-rotate="isAvatarVisible" />
            </div>
          </div>

          <!-- Three Cards Stacked on Right -->
          <div class="w-full md:w-1/2 flex flex-col gap-6 sm:gap-8 order-1 md:order-2">
            <div
              v-for="(item, idx) in whyChooseItems"
              :key="idx"
              class="flex flex-row gap-4 p-6 sm:p-8 rounded-xl bg-white border border-gray-200 shadow-sm hover:shadow-lg transition-all duration-300 animate-staggeredFadeIn group hover:-translate-y-2 flex-grow"
              :style="{ animationDelay: `${idx * 0.1}s` }"
            >
              <!-- Icon on left, vertically centered -->
              <div class="flex-shrink-0 flex items-center">
                <component :is="item.icon" class="w-8 h-8 sm:w-10 sm:h-10 text-gray-900 group-hover:scale-125 transition duration-300" />
              </div>
              <!-- Title and subtitle on right, stacked -->
              <div class="flex-1 flex flex-col">
                <h3 class="font-bold text-lg md:text-xl mb-2 group-hover:text-gray-600 transition">{{ item.title }}</h3>
                <p class="text-lg md:text-xl text-gray-600">{{ item.description }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
    
    <!-- CTA Section -->
    <section 
      class="cta-card-section bg-gray-50 text-gray-900 relative py-16 sm:py-20 md:py-28"
    >
      <div class="max-w-[1200px] mx-auto px-6 sm:px-8 lg:px-12 text-center flex flex-col items-center relative z-10 scroll-hidden animate-scaleIn" id="cta-content">
        <h2 class="cta-title text-gray-900 mb-3 sm:mb-5">
          Ready to Transform<span class="md:hidden"><br /></span> Your Closet?
        </h2>
        <p class="text-lg md:text-xl text-gray-600 max-w-2xl mx-auto mb-6 sm:mb-8">
          Join thousands of fashion enthusiasts who are already organising their closets and creating stunning outfits with StyleSnap.
        </p>
        <div class="flex justify-center">
        <button
            @click="handleSignUp"
            class="cta-signup-button flex items-center gap-2 px-6 py-3 rounded-full font-medium text-sm bg-black text-white hover:bg-gray-900 transition-all duration-200 shadow-md hover:shadow-lg"
        >
            <span class="whitespace-nowrap">Sign Up Now</span>
            <ArrowRight class="w-4 h-4 group-hover:translate-x-1 transition" />
        </button>
        </div>
      </div>
    </section>
    
    <!-- Footer Section -->
    <footer class="footer-static bg-black text-white w-full">
      <div class="max-w-[1200px] mx-auto px-8 pt-12 pb-12">
          <!-- Top Section: Branding and Links -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-12 mb-12">
            <!-- Left: Logo and Tagline -->
            <div class="flex flex-col gap-4">
              <div class="flex items-center gap-3">
                <StyleSnapLogo size="xl" class="footer-logo-white" />
                <StyleSnapBrand class="font-bold text-xl text-white" size="xl" />
              </div>
              <p class="text-sm text-gray-400 max-w-xs">
                Transform your fashion game with StyleSnap.
              </p>
            </div>
            
            <!-- Right: Navigation Links in 2-3 Columns -->
            <div class="flex justify-start md:justify-end">
              <div class="grid grid-cols-3 gap-6 md:gap-12 w-full md:w-auto">
                <!-- Column 1: Explore -->
                <div>
                  <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Explore</h3>
                  <ul class="space-y-3">
                    <li><a href="#features" class="text-sm text-white hover:text-gray-300 transition">Features</a></li>
                    <li><a href="#demo" class="text-sm text-white hover:text-gray-300 transition">Demo</a></li>
                    <li><a href="#why" class="text-sm text-white hover:text-gray-300 transition">Why StyleSnap</a></li>
                  </ul>
                </div>
                
                <!-- Column 2: Contact -->
                <div>
                  <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Contact</h3>
                  <ul class="space-y-3">
                    <li><a href="https://www.hong-yi.me" target="_blank" rel="noopener noreferrer" class="text-sm text-white hover:text-gray-300 transition">Help Center</a></li>
                    <li><a href="https://www.hong-yi.me" target="_blank" rel="noopener noreferrer" class="text-sm text-white hover:text-gray-300 transition">Support</a></li>
                    <li><a href="https://www.hong-yi.me" target="_blank" rel="noopener noreferrer" class="text-sm text-white hover:text-gray-300 transition">Contact Us</a></li>
                  </ul>
                </div>
                
                <!-- Column 3: Company -->
                <div>
                  <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Company</h3>
                  <ul class="space-y-3">
                    <li><a href="https://www.hong-yi.me" target="_blank" rel="noopener noreferrer" class="text-sm text-white hover:text-gray-300 transition">Careers</a></li>
                    <li><a href="https://www.hong-yi.me" target="_blank" rel="noopener noreferrer" class="text-sm text-white hover:text-gray-300 transition">Merch</a></li>
                    <li><a href="https://www.hong-yi.me" target="_blank" rel="noopener noreferrer" class="text-sm text-white hover:text-gray-300 transition">Social</a></li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Bottom Section: Copyright and Legal Links -->
          <div class="flex flex-col sm:flex-row justify-center md:justify-between items-center pt-6 border-t border-gray-800 gap-4">
            <p class="text-xs text-gray-400 text-center md:text-left">
              &copy; StyleSnap 2025. All rights reserved.
            </p>
            <div class="flex items-center gap-6">
              <button
                @click="showTerms = true"
                class="text-xs text-gray-400 hover:text-gray-300 transition whitespace-nowrap"
              >
                Terms
              </button>
              <button
                @click="showPrivacy = true"
                class="text-xs text-gray-400 hover:text-gray-300 transition whitespace-nowrap"
              >
                Privacy policy
              </button>
            </div>
          </div>
        </div>
      </footer>

    <!-- Modals -->
    <TermsOfServiceModal :isOpen="showTerms" @close="showTerms = false" />
    <PrivacyPolicyModal :isOpen="showPrivacy" @close="showPrivacy = false" />

  </div>
</template>

<script setup>
import ClothingImage from '@/components/ui/ClothingImage.vue'
import { ref, reactive, onMounted, onUnmounted, watch, computed, nextTick } from 'vue'
import { useAuthStore } from '@/stores/auth-store'
import { useRouter } from 'vue-router'
import { CatalogService } from '@/services/catalogService'
import { 
  Shirt, 
  Sparkles, 
  Users, 
  Zap, 
  ArrowRight, 
  Menu, 
  X, 
  Trash2,
  Palette,
  Camera,
  Heart,
  Undo,
  Redo,
  Grid3X3,
  Save,
  Plus,
  ArrowDown
} from 'lucide-vue-next'
import TermsOfServiceModal from '@/components/TermsOfServiceModal.vue'
import PrivacyPolicyModal from '@/components/PrivacyPolicyModal.vue'
import StyleSnapLogo from '@/components/StyleSnapLogo.vue'
import StyleSnapBrand from '@/components/StyleSnapBrand.vue'
import SingleAvatar3D from '@/components/SingleAvatar3D.vue'
import { useLazyLoad } from '@/composables/useLazyLoad'
import { usePopup } from '@/composables/usePopup'

// Import landing page animations
import '@/assets/css/landing-page-animations.css'

// Router instance
const router = useRouter()

// Popup composable
const { showWarning } = usePopup()

// Reactive state
const authStore = useAuthStore()
const isMenuOpen = ref(false)
const outfitItems = ref([])
const selectedItemId = ref(null)
const scrollY = ref(0)
const lastScrollY = ref(0)
const isScrollingDown = ref(false)
const showFooter = ref(false)
const showJoinButton = ref(false)
const draggedItem = ref(null)
const dragOffset = reactive({ x: 0, y: 0 })
const canvasRef = ref(null)
const isPageLoaded = ref(false)
const displayedTitle = ref('')
const showTypewriterCursor = ref(true)
// Detect mobile device - skip splash on mobile
const isMobileDevice = ref(false)
const checkMobileDevice = () => {
  isMobileDevice.value = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768
}
const showSplash = ref(true)
const showTerms = ref(false)
const showPrivacy = ref(false)
const isTransitioning = ref(false)
const animationComplete = ref(false)
const showHeroTitle = ref(false)
const heroTitleRef = ref(null)
const splashTransform = reactive({
  x: 0,
  y: 0,
  scale: 1,
  fontSize: ''
})
const finalTransform = reactive({
  x: 0,
  y: 0,
  fontSize: '2.5625rem'
})
const avatarSectionRef = ref(null)
const isAvatarVisible = ref(false)
let avatarObserver = null
const heroSectionRef = ref(null)
const heroImageLoaded = ref(false)
let scrollRafId = null
let footerDebounceTimer = null
const splashFading = ref(false)

// Lazy load hero background image
const heroBackgroundStyle = computed(() => {
  if (!heroImageLoaded.value) {
    return {
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      backgroundColor: '#000000' // Fallback color
    }
  }
  return {
    backgroundImage: 'url(/images/hero-fashion-outfit.jpg)',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat'
  }
})

// Catalog service instance
const catalogService = new CatalogService()

// Catalogue items and state
const catalogueItems = ref([])
const loadingCatalogue = ref(false)
const activeCategory = ref('all')
const showGrid = ref(false)
const categoryOptions = ['all', 'top', 'bottom', 'outerwear', 'shoes', 'accessories']

// Pagination for catalogue items (virtual scrolling)
const itemsPerPage = 10
const displayedItemsCount = ref(itemsPerPage)
const catalogueScrollRef = ref(null)

// Filtered catalogue items
const filteredCatalogueItems = computed(() => {
  let filtered = catalogueItems.value
  
  if (activeCategory.value !== 'all') {
    filtered = filtered.filter(item => {
      const itemCategory = (item.category || '').toLowerCase()
      return itemCategory === activeCategory.value.toLowerCase()
    })
  }
  
  return filtered
})

// Displayed catalogue items (pagination)
const displayedCatalogueItems = computed(() => {
  return filteredCatalogueItems.value.slice(0, displayedItemsCount.value)
})

// Load more items when scrolling
const loadMoreItems = () => {
  if (displayedItemsCount.value < filteredCatalogueItems.value.length) {
    displayedItemsCount.value += itemsPerPage
  }
}

// Categories with items (only show categories that have at least 1 item)
const availableCategories = computed(() => {
  const categoriesWithItems = ['all'] // Always show "all"
  
  categoryOptions.forEach(category => {
    if (category === 'all') return
    
    const count = catalogueItems.value.filter(item => {
      const itemCategory = (item.category || '').toLowerCase()
      return itemCategory === category.toLowerCase()
    }).length
    
    if (count > 0) {
      categoriesWithItems.push(category)
    }
  })
  
  return categoriesWithItems
})

// Features data - Photo Capture first
const features = ref([
  {
    id: 'photo-capture',
    icon: Camera,
    title: 'Photo Capture',
    description: 'Instantly capture and catalog your clothing items with smart photo recognition.',
    expandedDescription: 'Snap photos to automatically identify clothing items, extract colors and patterns. No manual entry needed - items instantly added to your digital closet.',
    flipped: false,
    expanded: false,
  },
  {
    id: 'digital-closet',
    icon: Shirt,
    title: 'Digital Closet',
    description: 'Organise all your clothing items by category. Track what you own and never lose track of your favourite pieces.',
    expandedDescription: 'Organize your wardrobe into a digital catalog by type, color, and occasion. Search and filter to find items quickly with tags and outfit history.',
    flipped: false,
    expanded: false,
  },
  {
    id: 'outfit-creator',
    icon: Zap,
    title: 'Outfit Creator',
    description: 'Drag and drop to create stunning outfits. Get AI-powered suggestions for perfect combinations.',
    expandedDescription: 'Create unlimited outfit combinations with drag-and-drop. AI analyzes color theory and trends to suggest perfect style pairings.',
    flipped: false,
    expanded: false,
  },
  {
    id: 'share-connect',
    icon: Users,
    title: 'Share & Connect',
    description: 'Share your outfits with friends, get feedback, and discover inspiration from their styles.',
    expandedDescription: 'Build your fashion community by sharing outfits with friends. Get feedback and browse collections for endless style inspiration.',
    flipped: false,
    expanded: false,
  },
  {
    id: 'style-analyzer',
    icon: Palette,
    title: 'Style Analyzer',
    description: 'Analyze your fashion choices and discover your unique style profile.',
    expandedDescription: 'Discover your style DNA as AI examines your wardrobe choices. Get personalized recommendations for minimalist, boho, classic, or trendy aesthetics.',
    flipped: false,
    expanded: false,
  },
  {
    id: 'favorites',
    icon: Heart,
    title: 'Favorites & Collections',
    description: 'Save your favorite pieces, create wishlists, and build curated collections.',
    expandedDescription: 'Create collections for occasions and seasons. Save items from your closet, friends\' outfits, or shopping sites with smart reminders.',
    flipped: false,
    expanded: false,
  },
])

// Carousel state
const carouselRotation = ref(0)
const flipTimers = ref({}) // Track timers for auto-flip back
const carouselWrapperRef = ref(null)
const isCarouselActive = ref(false)
const isCarouselVisible = ref(false)
let carouselRafId = null
let carouselObserver = null
let lastRotationUpdate = 0
const ROTATION_THROTTLE_MS = 16 // ~60fps

// Calculate rotation step for each card (for snapping)
const rotationStep = computed(() => {
  return features.value.length > 0 ? 360 / features.value.length : 60
})

// Slider value (0-360 degrees) - computed property for display
const sliderValue = computed(() => {
  // Normalize rotation to 0-360 range for slider
  // Since rotation is reversed, we need to convert: -rotation -> slider value
  let normalized = (-carouselRotation.value) % 360
  if (normalized < 0) normalized += 360
  return normalized
})

// Snap value to nearest card position
const snapToCardPosition = (value) => {
  const step = rotationStep.value
  return Math.round(value / step) * step
}

// Throttled carousel rotation update
const updateCarouselRotationThrottled = (value) => {
  const now = performance.now()
  if (now - lastRotationUpdate < ROTATION_THROTTLE_MS) {
    if (carouselRafId) return
    carouselRafId = requestAnimationFrame(() => {
      carouselRotation.value = -value
      lastRotationUpdate = performance.now()
      carouselRafId = null
    })
  } else {
    carouselRotation.value = -value
    lastRotationUpdate = now
  }
}

// Update carousel rotation from slider - smooth during drag
const updateCarouselRotation = (event) => {
  const value = parseFloat(event.target.value)
  isCarouselActive.value = true
  
  // Throttle rotation updates
  updateCarouselRotationThrottled(value)
  
  // Remove active state after animation
  setTimeout(() => {
    isCarouselActive.value = false
  }, 300)
}

// Snap to nearest card position on release (haptic-like feedback)
const snapOnRelease = (event) => {
  const value = parseFloat(event.target.value)
  const snappedValue = snapToCardPosition(value)
  
  // Always snap to nearest card position on release for haptic-like feedback
  if (Math.abs(value - snappedValue) > 0.1) {
    // Update slider value to snapped position
    event.target.value = snappedValue
    // Update carousel rotation with smooth snap animation
    isCarouselActive.value = true
    updateCarouselRotationThrottled(snappedValue)
    setTimeout(() => {
      isCarouselActive.value = false
    }, 300)
  }
}

// Move to next card (rotate forward)
const moveToNextCard = () => {
  const currentSliderValue = sliderValue.value
  const step = rotationStep.value
  const nextValue = (currentSliderValue + step) % 360
  isCarouselActive.value = true
  updateCarouselRotationThrottled(nextValue)
  setTimeout(() => {
    isCarouselActive.value = false
  }, 300)
}

// Move to previous card (rotate backward)
const moveToPreviousCard = () => {
  const currentSliderValue = sliderValue.value
  const step = rotationStep.value
  let prevValue = (currentSliderValue - step) % 360
  if (prevValue < 0) prevValue += 360
  isCarouselActive.value = true
  updateCarouselRotationThrottled(prevValue)
  setTimeout(() => {
    isCarouselActive.value = false
  }, 300)
}

// Handle keyboard arrow keys for carousel navigation
const handleKeyboardNavigation = (event) => {
  // Only handle arrow keys if not typing in an input field
  if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
    return
  }
  
  // Handle Delete key to delete selected canvas item
  if (event.key === 'Delete' || event.key === 'Backspace') {
    if (selectedItemId.value) {
      event.preventDefault()
      deleteSelectedItem()
      return
    }
  }
  
  if (event.key === 'ArrowRight') {
    event.preventDefault()
    moveToNextCard()
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault()
    moveToPreviousCard()
  }
}

// Avatar URLs for random selection
const avatarUrls = [
  'https://models.readyplayer.me/690030c2657a118475704718.glb',
  'https://models.readyplayer.me/690030eb16afa77eb4fbeb91.glb',
  'https://models.readyplayer.me/6900316350f0151f18f12166.glb',
  'https://models.readyplayer.me/690031b503a04907a7367d03.glb',
  'https://models.readyplayer.me/6900321e03a04907a73686be.glb',
  'https://models.readyplayer.me/6900328321aeaea077d3f32e.glb',
  'https://models.readyplayer.me/690032b5cc76da0daf9b671c.glb',
  'https://models.readyplayer.me/690032ff08032bae29097e9b.glb',
  'https://models.readyplayer.me/6900333003a04907a7369c05.glb',
  'https://models.readyplayer.me/69003054afd9f514ac528c56.glb',
  'https://models.readyplayer.me/690026ea4e683ec207c58310.glb'
]

// Randomly select one avatar on page load
const selectedAvatarUrl = ref('')

// Why choose items data
const whyChooseItems = [
  {
    icon: Zap,
    title: 'Save Time',
    description: 'Spend less time deciding what to wear and more time looking fabulous.',
  },
  {
    icon: Shirt,
    title: 'Maximize Your Wardrobe',
    description: 'Discover new outfit combinations you never thought of before.',
  },
  {
    icon: Users,
    title: 'Build Community',
    description: 'Connect with friends and share your fashion inspiration daily.',
  },
]

// Auth handlers - Navigate to login page
const handleLogin = () => {
  isMenuOpen.value = false
  router.push({ path: '/login', query: { mode: 'login' } })
}

const handleSignUp = () => {
  isMenuOpen.value = false
  router.push({ path: '/login', query: { mode: 'signup' } })
}

// Touch tracking for cards
const cardTouchData = ref({ startX: 0, startY: 0, startTime: 0, cardIndex: null })

// Handle card touch start
const handleCardTouchStart = (index, featureId, event) => {
  if (!isCardFrontFacing(index)) {
    return
  }
  
  // Track touch start for tap detection
  if (event.touches && event.touches.length > 0) {
    cardTouchData.value = {
      startX: event.touches[0].clientX,
      startY: event.touches[0].clientY,
      startTime: Date.now(),
      cardIndex: index,
      featureId: featureId
    }
  }
}

// Handle card touch end (mobile tap)
const handleCardTouchEnd = (index, featureId, event) => {
  // Only process if this is the same card we started touching
  if (cardTouchData.value.cardIndex !== index || !isCardFrontFacing(index)) {
    return
  }
  
  // Check if this was a tap (not a swipe)
  let moved = false
  if (event.changedTouches && event.changedTouches.length > 0) {
    const deltaX = Math.abs(event.changedTouches[0].clientX - cardTouchData.value.startX)
    const deltaY = Math.abs(event.changedTouches[0].clientY - cardTouchData.value.startY)
    const deltaTime = Date.now() - cardTouchData.value.startTime
    
    // If moved more than 10px or took longer than 300ms, it's a swipe/drag, not a tap
    if (deltaX > 10 || deltaY > 10 || deltaTime > 300) {
      moved = true
    }
  }
  
  if (!moved) {
    event.preventDefault()
    event.stopPropagation()
    toggleFeatureExpand(featureId)
  }
  
  // Reset touch data
  cardTouchData.value = { startX: 0, startY: 0, startTime: 0, cardIndex: null }
}

// Handle card hover - flip card to show information immediately
const handleCardHover = (index, featureId) => {
  const feature = features.value.find(f => f.id === featureId)
  if (!feature) return
  
  // Clear any existing timers
  if (flipTimers.value[featureId]) {
    clearTimeout(flipTimers.value[featureId])
    delete flipTimers.value[featureId]
  }
  
  // Close all other flipped features (only one card can flip at a time)
  features.value.forEach(f => {
    if (f.id !== featureId && f.flipped) {
      f.flipped = false
      if (flipTimers.value[f.id]) {
        clearTimeout(flipTimers.value[f.id])
        delete flipTimers.value[f.id]
      }
    }
  })
  
  // Flip the card immediately on hover
  feature.flipped = true
}

// Handle card hover leave - flip card back to front
const handleCardHoverLeave = (featureId) => {
  const feature = features.value.find(f => f.id === featureId)
  if (!feature) return
  
  // Clear any existing timers
  if (flipTimers.value[featureId]) {
    clearTimeout(flipTimers.value[featureId])
    delete flipTimers.value[featureId]
  }
  
  // Flip the card back
  feature.flipped = false
}

// Computed property to track which card is front-facing (reactive to carouselRotation)
const frontFacingCardIndex = computed(() => {
  const totalCards = features.value.length
  if (totalCards === 0) return -1
  
  const rotation = carouselRotation.value
  
  // Find which card is closest to center (0 degrees)
  let minDistance = Infinity
  let frontCardIndex = -1
  
  for (let i = 0; i < totalCards; i++) {
    const cardAngle = i * (360 / totalCards)
    // Calculate effective angle after rotation
    // When container rotates -60°, card at 60° appears at 60° + (-60°) = 0°
    let effectiveAngle = (cardAngle + rotation) % 360
    if (effectiveAngle < 0) effectiveAngle += 360
    
    // Distance to center (0 or 360)
    const distanceToCenter = Math.min(effectiveAngle, 360 - effectiveAngle)
    
    if (distanceToCenter < minDistance) {
      minDistance = distanceToCenter
      frontCardIndex = i
    }
  }
  
  return frontCardIndex
})

// Check if a card is facing forward
const isCardFrontFacing = (index) => {
  return index === frontFacingCardIndex.value
}


const isItemSelected = (itemId) => {
  return outfitItems.value.some(item => item.id === itemId)
}

const addItemToOutfit = (itemId) => {
  // This function is kept for compatibility but not used anymore
  // Items are added via addCatalogueItemToCanvas
}

const removeItemFromOutfit = (itemId) => {
  outfitItems.value = outfitItems.value.filter(item => item.id !== itemId)
}

const toggleItemInOutfit = (itemId) => {
  if (isItemSelected(itemId)) {
    removeItemFromOutfit(itemId)
  } else {
    addItemToOutfit(itemId)
  }
}

// Handle catalogue scroll for infinite loading
const handleCatalogueScroll = (event) => {
  const target = event.target
  const scrollPercentage = (target.scrollTop + target.clientHeight) / target.scrollHeight
  
  // Load more when scrolled to 80%
  if (scrollPercentage > 0.8 && displayedItemsCount.value < filteredCatalogueItems.value.length) {
    loadMoreItems()
  }
}

// Load catalogue items
const loadCatalogueItems = async () => {
  loadingCatalogue.value = true
  try {
    // Use public catalog items method (no authentication required)
    const items = await catalogService.getPublicCatalogItems({
      limit: 20,
      offset: 0
    })
    catalogueItems.value = items || []
    // Reset displayed count when category changes
    displayedItemsCount.value = itemsPerPage
  } catch (error) {
    console.error('Landing: Error loading catalogue items:', error)
    catalogueItems.value = []
  } finally {
    loadingCatalogue.value = false
  }
}

// Reset displayed count when category changes
watch(activeCategory, () => {
  displayedItemsCount.value = itemsPerPage
})

// Check if two rectangles overlap
const rectsOverlap = (a, b) => {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  )
}

// Find a non-overlapping position for a new item
// Returns { x, y, scale } - scale may be reduced if no space is found
const findNonOverlappingPosition = (existingItems, itemSize, startX, startY, canvasWidth, canvasHeight) => {
  const maxAttempts = 50
  let currentScale = 1.0
  const minScale = 0.3 // Minimum scale to try
  
  // Try different scales, starting from full size
  while (currentScale >= minScale) {
    const scaledSize = itemSize * currentScale
    
    // Try positions in a spiral pattern from the drop point
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const angleIndex = attempt % 8 // 8 directions (0-7)
      const circleIndex = Math.floor(attempt / 8) // Which circle (0, 1, 2, ...)
      const angle = (angleIndex * 45) * (Math.PI / 180) // Convert to radians
      const radius = (circleIndex + 1) * (scaledSize * 0.6) // Increase radius each circle
      
      const x = startX + radius * Math.cos(angle) - (scaledSize / 2)
      const y = startY + radius * Math.sin(angle) - (scaledSize / 2)
      
      // Check bounds
      if (x < 0 || y < 0 || x + scaledSize > canvasWidth || y + scaledSize > canvasHeight) {
        continue
      }
      
      // Check for overlaps with existing items
      const newRect = {
        x: x,
        y: y,
        width: scaledSize,
        height: scaledSize
      }
      
      let overlaps = false
      for (const existingItem of existingItems) {
        const existingRect = {
          x: existingItem.x,
          y: existingItem.y,
          width: itemSize * (existingItem.scale || 1),
          height: itemSize * (existingItem.scale || 1)
        }
        
        if (rectsOverlap(newRect, existingRect)) {
          overlaps = true
          break
        }
      }
      
      if (!overlaps) {
        return { x, y, scale: currentScale }
      }
    }
    
    // If no position found at current scale, try smaller scale
    currentScale -= 0.1
  }
  
  // If still no position found, place at center with minimum scale
  return {
    x: (canvasWidth / 2) - (itemSize * minScale / 2),
    y: (canvasHeight / 2) - (itemSize * minScale / 2),
    scale: minScale
  }
}

// Add item to canvas from catalogue
const addCatalogueItemToCanvas = (item) => {
  if (!canvasRef.value) return
  
  // Validate: Maximum 10 items on canvas
  if (outfitItems.value.length >= 10) {
    showWarning('Maximum 10 items allowed on canvas. Please remove an item before adding a new one.')
    return
  }
  
  // Check if item already exists on canvas (by originalId)
  const itemAlreadyOnCanvas = outfitItems.value.some(canvasItem => canvasItem.originalId === item.id)
  if (itemAlreadyOnCanvas) {
    showWarning('This item is already on the canvas. Each item can only be added once.')
    return
  }
  
  const rect = canvasRef.value.getBoundingClientRect()
  const itemSize = 128
  
  // Define button area exclusion zones
  // Top area: 80px (for top navigation)
  const TOP_BUTTON_AREA_HEIGHT = 80
  // Bottom area: 80px (for bottom toolbar/buttons)
  const BOTTOM_BUTTON_AREA_HEIGHT = 80
  
  // Start position: center of canvas, but below top button area and above bottom button area
  const centerX = rect.width / 2
  const maxYPosition = rect.height - itemSize - BOTTOM_BUTTON_AREA_HEIGHT
  const centerY = Math.max(
    TOP_BUTTON_AREA_HEIGHT + 100, // Ensure below top button area
    Math.min((rect.height / 2), maxYPosition) // And above bottom button area
  )
  
  // Find a non-overlapping position
  const position = findNonOverlappingPosition(
    outfitItems.value,
    itemSize,
    centerX,
    centerY,
    rect.width,
    rect.height
  )
  
  // Calculate max Y position to avoid bottom button area
  const maxYPositionForItem = rect.height - (itemSize * position.scale) - BOTTOM_BUTTON_AREA_HEIGHT
  
  // Ensure new items start with z_index >= 2 (above grid)
  const baseZIndex = Math.max(2, outfitItems.value.length + 2)
  
  const newItem = {
    ...item,
    originalId: item.id, // Store original clothing item ID
    id: `canvas-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // Unique canvas ID
    x: Math.max(0, Math.min(position.x, rect.width - (itemSize * position.scale))),
    y: Math.max(TOP_BUTTON_AREA_HEIGHT, Math.min(position.y, maxYPositionForItem)),
    scale: position.scale,
    rotation: 0,
    z_index: baseZIndex,
  }
  
  outfitItems.value.push(newItem)
  selectedItemId.value = newItem.id
}

// Handle drag from catalogue
const handleCatalogDragStart = (item, event) => {
  event.dataTransfer.setData('text/plain', JSON.stringify(item))
  event.dataTransfer.effectAllowed = 'move'
}

// Handle drop on canvas
const handleDrop = (event) => {
  event.preventDefault()
  if (!canvasRef.value) return
  
  try {
    // Validate: Maximum 10 items on canvas
    if (outfitItems.value.length >= 10) {
      showWarning('Maximum 10 items allowed on canvas. Please remove an item before adding a new one.')
      return
    }
    
    const itemData = event.dataTransfer.getData('text/plain')
    const item = JSON.parse(itemData)
    
    // Check if item already exists on canvas (by originalId)
    const itemAlreadyOnCanvas = outfitItems.value.some(canvasItem => canvasItem.originalId === item.id)
    if (itemAlreadyOnCanvas) {
      showWarning('This item is already on the canvas. Each item can only be added once.')
      return
    }
    
    const rect = canvasRef.value.getBoundingClientRect()
    const itemSize = 128
    const dropX = event.clientX - rect.left
    const dropY = event.clientY - rect.top
    
    // Define button area exclusion zones
    // Top area: 80px (for top navigation)
    const TOP_BUTTON_AREA_HEIGHT = 80
    // Bottom area: 80px (for bottom toolbar/buttons)
    const BOTTOM_BUTTON_AREA_HEIGHT = 80
    
    // Find a non-overlapping position
    const position = findNonOverlappingPosition(
      outfitItems.value,
      itemSize,
      dropX,
      dropY,
      rect.width,
      rect.height
    )
    
    // Calculate max Y position to avoid bottom button area
    const maxYPositionForItem = rect.height - (itemSize * position.scale) - BOTTOM_BUTTON_AREA_HEIGHT
    
    // Ensure new items start with z_index >= 2 (above grid)
    const baseZIndex = Math.max(2, outfitItems.value.length + 2)
    
    const newItem = {
      ...item,
      originalId: item.id, // Store original clothing item ID
      id: `canvas-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // Unique canvas ID
      x: Math.max(0, Math.min(position.x, rect.width - (itemSize * position.scale))),
      y: Math.max(TOP_BUTTON_AREA_HEIGHT, Math.min(position.y, maxYPositionForItem)),
      scale: position.scale,
      rotation: 0,
      z_index: baseZIndex
    }
    
    outfitItems.value.push(newItem)
    selectedItemId.value = newItem.id
  } catch (error) {
    console.error('Error handling drop:', error)
  }
}

// Toggle grid
const toggleGrid = () => {
  showGrid.value = !showGrid.value
}

const clearOutfit = () => {
  outfitItems.value = []
}

const handleMouseDown = (item, event) => {
  if (!canvasRef.value) return
  
  // Handle both mouse and touch events
  const isTouch = event.touches && event.touches.length > 0
  const clientX = isTouch ? event.touches[0].clientX : event.clientX
  const clientY = isTouch ? event.touches[0].clientY : event.clientY
  
  selectedItemId.value = item.id
  draggedItem.value = item.id
  const rect = canvasRef.value.getBoundingClientRect()
  dragOffset.x = clientX - rect.left - item.x
  dragOffset.y = clientY - rect.top - item.y
  
  if (isTouch) {
    event.preventDefault()
    document.addEventListener('touchmove', handleMouseMove, { passive: false })
    document.addEventListener('touchend', handleMouseUp)
    document.addEventListener('touchcancel', handleMouseUp)
  }
}

const handleTouchStart = (item, event) => {
  handleMouseDown(item, event)
}

const handleMouseMove = (e) => {
  // Handle drag
  if (!draggedItem.value || !canvasRef.value) return

  // Handle both mouse and touch events
  const isTouch = e.touches && e.touches.length > 0
  const clientX = isTouch ? e.touches[0].clientX : e.clientX
  const clientY = isTouch ? e.touches[0].clientY : e.clientY

  const rect = canvasRef.value.getBoundingClientRect()
  const x = clientX - rect.left - dragOffset.x
  const y = clientY - rect.top - dragOffset.y

  // Constrain to canvas bounds
  const itemSize = 128
  const constrainedX = Math.max(0, Math.min(x, rect.width - itemSize))
  const constrainedY = Math.max(0, Math.min(y, rect.height - itemSize))

  outfitItems.value = outfitItems.value.map(item =>
    item.id === draggedItem.value ? { ...item, x: constrainedX, y: constrainedY } : item
  )
  
  if (isTouch) {
    e.preventDefault() // Prevent scrolling while dragging
  }
}

const handleMouseUp = () => {
  draggedItem.value = null
  
  // Remove touch event listeners if they were added
  document.removeEventListener('touchmove', handleMouseMove)
  document.removeEventListener('touchend', handleMouseUp)
  document.removeEventListener('touchcancel', handleMouseUp)
}

// Selection and toolbar functions
const selectItem = (itemId) => {
  // Select the item - stays selected until another item is selected or canvas is clicked
  selectedItemId.value = itemId
}

const scaleSelectedItem = (delta) => {
  if (!selectedItemId.value) return
  
  const item = outfitItems.value.find(i => i.id === selectedItemId.value)
  if (item) {
    const newScale = Math.max(0.3, Math.min(3, (item.scale || 1) + delta))
    item.scale = newScale
  }
}

const rotateSelectedItem = (degrees) => {
  if (!selectedItemId.value) return
  
  const item = outfitItems.value.find(i => i.id === selectedItemId.value)
  if (item) {
    item.rotation = (item.rotation || 0) + degrees
  }
}

const moveSelectedItemForward = () => {
  if (!selectedItemId.value) return
  
  const itemIndex = outfitItems.value.findIndex(i => i.id === selectedItemId.value)
  if (itemIndex === -1) return
  
  const item = outfitItems.value[itemIndex]
  
  // Ensure item has a z_index (normalize old items that might have 0 or undefined)
  const currentZIndex = Math.max(2, item.z_index || 2)
  
  // Get all items with their z-indexes normalized
  const itemsWithZ = outfitItems.value.map((i, idx) => ({
    ...i,
    index: idx,
    normalizedZ: Math.max(2, i.z_index || 2)
  }))
  
  // Find all items with z-index greater than current
  const itemsAbove = itemsWithZ.filter(i => i.id !== item.id && i.normalizedZ > currentZIndex)
  
  if (itemsAbove.length > 0) {
    // Find the item with the smallest z-index above current (swap with it)
    const minAboveZIndex = Math.min(...itemsAbove.map(i => i.normalizedZ))
    const swapItem = itemsWithZ.find(i => i.id !== item.id && i.normalizedZ === minAboveZIndex)
    
    if (swapItem) {
      // Swap z-indexes by creating new array with updated items - use ID to identify items
      outfitItems.value = outfitItems.value.map((i) => {
        if (i.id === item.id) {
          return { ...i, z_index: swapItem.normalizedZ }
        } else if (i.id === swapItem.id) {
          return { ...i, z_index: currentZIndex }
        }
        return i
      })
    } else {
      // Fallback: just increment
      const maxZIndex = Math.max(...itemsWithZ.map(i => i.normalizedZ), 2)
      outfitItems.value = outfitItems.value.map((i) => 
        i.id === item.id ? { ...i, z_index: maxZIndex + 1 } : i
      )
    }
  } else {
    // No items above, move to front
    const maxZIndex = Math.max(...itemsWithZ.map(i => i.normalizedZ), 2)
    outfitItems.value = outfitItems.value.map((i) => 
      i.id === item.id ? { ...i, z_index: maxZIndex + 1 } : i
    )
  }
}

const moveSelectedItemBackward = () => {
  if (!selectedItemId.value) return
  
  const itemIndex = outfitItems.value.findIndex(i => i.id === selectedItemId.value)
  if (itemIndex === -1) return
  
  const item = outfitItems.value[itemIndex]
  
  // Ensure item has a z_index (normalize old items that might have 0 or undefined)
  const currentZIndex = Math.max(2, item.z_index || 2)
  
  // Get min z-index among all items (normalize all to ensure minimum of 2)
  const itemsWithZ = outfitItems.value.map((i, idx) => ({
    ...i,
    index: idx,
    normalizedZ: Math.max(2, i.z_index || 2)
  }))
  const minZIndex = Math.min(...itemsWithZ.map(i => i.normalizedZ), 2)
  
  // If already at min (2), do nothing
  if (currentZIndex <= minZIndex) {
    return
  }
  
  // Find all items with z-index less than current
  const itemsBelow = itemsWithZ.filter(i => i.id !== item.id && i.normalizedZ < currentZIndex)
  
  if (itemsBelow.length > 0) {
    // Find the item with the largest z-index below current (swap with it)
    const maxBelowZIndex = Math.max(...itemsBelow.map(i => i.normalizedZ))
    const swapItem = itemsWithZ.find(i => i.id !== item.id && i.normalizedZ === maxBelowZIndex)
    
    if (swapItem) {
      // Swap z-indexes by creating new array with updated items - use ID to identify items
      outfitItems.value = outfitItems.value.map((i) => {
        if (i.id === item.id) {
          return { ...i, z_index: swapItem.normalizedZ }
        } else if (i.id === swapItem.id) {
          return { ...i, z_index: currentZIndex }
        }
        return i
      })
    } else {
      // Fallback: just decrement (but ensure minimum of 2)
      outfitItems.value = outfitItems.value.map((i) => 
        i.id === item.id ? { ...i, z_index: Math.max(2, currentZIndex - 1) } : i
      )
    }
  } else {
    // No items below, just decrement (but ensure minimum of 2)
    outfitItems.value = outfitItems.value.map((i) => 
      i.id === item.id ? { ...i, z_index: Math.max(2, currentZIndex - 1) } : i
    )
  }
}

const deleteSelectedItem = () => {
  if (!selectedItemId.value) return
  
  outfitItems.value = outfitItems.value.filter(item => item.id !== selectedItemId.value)
  selectedItemId.value = null
}

// Scroll to top functionality
const scrollToTop = () => {
  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  })
}

// Calculate position for splash transition
const calculateSplashTransform = () => {
  if (!heroTitleRef.value) return
  
  const heroRect = heroTitleRef.value.getBoundingClientRect()
  const splashCenterX = window.innerWidth / 2
  const splashCenterY = window.innerHeight / 2
  
  // Get the splash title element to read its current font size
  const splashTitleEl = document.querySelector('.splash-title')
  let splashFontSize = '3.5rem' // default
  
  if (splashTitleEl) {
    const splashStyles = window.getComputedStyle(splashTitleEl)
    splashFontSize = splashStyles.fontSize
    splashTransform.fontSize = splashFontSize
  }
  
  // Get computed styles to match exactly
  const heroStyles = window.getComputedStyle(heroTitleRef.value)
  const heroLineHeight = parseFloat(heroStyles.lineHeight) || parseFloat(heroStyles.fontSize) * 1.2
  
  // Calculate the visual center of the hero text
  const heroCenterY = heroRect.top + (heroRect.height / 2)
  const heroTextCenter = heroRect.left + (heroRect.width / 2)
  
  // Calculate transform to move splash center to hero center
  const finalX = heroTextCenter - splashCenterX
  const finalY = heroCenterY - splashCenterY
  
  splashTransform.x = finalX
  splashTransform.y = finalY
  splashTransform.scale = 1
  
  // Store the final values for locking later
  finalTransform.x = finalX
  finalTransform.y = finalY
  finalTransform.fontSize = splashFontSize
  
  // Ensure splash title matches hero title width for layout preservation
  // This ensures text wraps identically
  if (splashTitleEl && heroTitleRef.value) {
    const heroComputedWidth = heroRect.width
    // Get the hero's parent container to match its constraints
    const heroContainer = heroTitleRef.value.closest('.container')
    if (heroContainer) {
      const containerRect = heroContainer.getBoundingClientRect()
      const containerWidth = containerRect.width
      // Apply container width constraint to preserve layout
      // Account for padding by using the container width
      splashTitleEl.style.maxWidth = `${containerWidth}px`
      splashTitleEl.style.width = 'auto' // Let width be auto to accommodate padding
    } else {
      // Fallback to hero title width
      splashTitleEl.style.width = 'auto'
      splashTitleEl.style.maxWidth = `${heroComputedWidth}px`
    }
  }
}

// Typewriter effect
const typewriterEffect = () => {
  const fullText = 'Transform Your Fashion Game'
  let index = 0
  
  const typeChar = () => {
    if (index < fullText.length) {
      displayedTitle.value = fullText.substring(0, index + 1)
      index++
      setTimeout(typeChar, 80) // Adjust speed here (lower = faster)
    } else {
      // Hide cursor after typing is complete
      showTypewriterCursor.value = false
      
      // Wait a moment, then start transition
      setTimeout(() => {
        // Calculate target position
        nextTick(() => {
          calculateSplashTransform()
          
          // Start transition immediately after calculation
          requestAnimationFrame(() => {
            isTransitioning.value = true
            
            // Wait for transition to complete
            setTimeout(() => {
              animationComplete.value = true
              
              // Show hero title and fade out splash background
              setTimeout(() => {
                showHeroTitle.value = true
                splashFading.value = true
                setTimeout(() => {
                  showSplash.value = false
                }, 800) // Fade duration
              }, 50)
            }, 1000) // Shorter transition duration for mobile
          })
        })
      }, 500) // Pause after typing finishes
    }
  }
  
  typeChar()
}

// Skip animation function
const skipAnimation = () => {
  // Stop all animations immediately
  showTypewriterCursor.value = false
  displayedTitle.value = 'Transform Your Fashion Game'
  
  // Calculate and apply final transform immediately
  nextTick(() => {
    calculateSplashTransform()
    
    // Set transition state
    isTransitioning.value = true
    
    // After a brief moment, fade out splash and show page
    setTimeout(() => {
      animationComplete.value = true
      enableBodyScroll()
      
      setTimeout(() => {
        showHeroTitle.value = true
        splashFading.value = true
        setTimeout(() => {
          showSplash.value = false
        }, 800) // Fade duration
      }, 100)
    }, 200)
  })
}

// Prevent body scrolling when splash screen is displayed
const disableBodyScroll = () => {
  document.body.style.overflow = 'hidden'
  document.body.style.position = 'fixed'
  document.body.style.width = '100%'
}

const enableBodyScroll = () => {
  document.body.style.overflow = ''
  document.body.style.position = ''
  document.body.style.width = ''
}

// Watch for splash screen visibility and disable/enable scrolling
watch(showSplash, (isVisible) => {
  if (isVisible) {
    disableBodyScroll()
  } else {
    enableBodyScroll()
  }
}, { immediate: true })

// Function to normalize section heights (except hero)
const normalizeSectionHeights = () => {
  // Wait for next tick to ensure DOM is fully rendered
  nextTick(() => {
    // Get all sections except hero
    const sections = document.querySelectorAll('section:not(.hero-section)')
    if (sections.length === 0) return
    
    // Wait for images to load
    const images = document.querySelectorAll('section:not(.hero-section) img')
    const imagePromises = Array.from(images).map(img => {
      if (img.complete) return Promise.resolve()
      return new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = resolve // Resolve even on error to not block
        // Timeout after 2 seconds
        setTimeout(resolve, 2000)
      })
    })
    
    Promise.all(imagePromises).then(() => {
      // Reset min-height to auto to get natural height
      sections.forEach(section => {
        section.style.minHeight = 'auto'
      })
      
      // Wait a moment for layout to recalculate after images load
      setTimeout(() => {
        let tallestHeight = 0
        
        // Find the tallest section
        sections.forEach(section => {
          const height = section.offsetHeight
          if (height > tallestHeight) {
            tallestHeight = height
          }
        })
        
        // Apply tallest height to all sections
        if (tallestHeight > 0) {
          sections.forEach(section => {
            section.style.minHeight = `${tallestHeight}px`
          })
        }
      }, 150)
    })
  })
}

// Lifecycle hooks
onMounted(async () => {
  // Set page as loaded immediately to prevent flicker
  isPageLoaded.value = true
  
  // Check if mobile device
  checkMobileDevice()
  
  // Randomly select an avatar (both mobile and desktop)
  const randomIndex = Math.floor(Math.random() * avatarUrls.length)
  selectedAvatarUrl.value = avatarUrls[randomIndex]
  
  // Skip splash screen on mobile - show landing page directly
  if (isMobileDevice.value) {
    showSplash.value = false
    showHeroTitle.value = true
    enableBodyScroll()
  } else {
    // Start typewriter effect (desktop only)
    typewriterEffect()
  }
  
  // Throttle scroll handler with RAF
  const handleScroll = () => {
    if (scrollRafId) return
    
    scrollRafId = requestAnimationFrame(() => {
      const currentScrollY = window.scrollY
      setScrollY(currentScrollY)
      
      // Detect scroll direction
      isScrollingDown.value = currentScrollY > lastScrollY.value
      lastScrollY.value = currentScrollY
      
      // Show "Join for free" button when user scrolls past hero section (about 80% of viewport height)
      const windowHeight = window.innerHeight
      if (currentScrollY > windowHeight * 0.8) {
        showJoinButton.value = true
      } else {
        showJoinButton.value = false
      }
      
      // Debounce footer visibility updates
      updateFooterVisibility()
      
      scrollRafId = null
    })
  }
  window.addEventListener('scroll', handleScroll, { passive: true })
  
  // Debounce footer show/hide logic (separate from scroll handler)
  const updateFooterVisibility = () => {
    if (footerDebounceTimer) clearTimeout(footerDebounceTimer)
    
    footerDebounceTimer = setTimeout(() => {
      const currentScrollY = window.scrollY
      const documentHeight = document.documentElement.scrollHeight
      const windowHeight = window.innerHeight
      const scrollPercentage = (currentScrollY / (documentHeight - windowHeight)) * 100
      
      if (isScrollingDown.value && scrollPercentage > 70) {
        showFooter.value = true
      } else if (!isScrollingDown.value && scrollPercentage < 60) {
        showFooter.value = false
      }
    }, 150) // Debounce footer updates
  }
  
  // Intersection Observer for scroll animations (optimized threshold)
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          // Add visible class and trigger animation
          entry.target.classList.add('scroll-visible')
          
          // Trigger specific animation immediately
          if (entry.target.classList.contains('animate-slideInFromLeft')) {
            entry.target.style.animation = 'slideInFromLeft 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards'
          } else if (entry.target.classList.contains('animate-slideInFromRight')) {
            entry.target.style.animation = 'slideInFromRight 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards'
          } else if (entry.target.classList.contains('animate-slideInFromBottom')) {
            entry.target.style.animation = 'slideInFromBottom 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards'
          } else if (entry.target.classList.contains('animate-scaleIn')) {
            entry.target.style.animation = 'scaleIn 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards'
          }
        } else {
          // When user scrolls away from the features section cards, play reverse animation
          const isFeatureCard = entry.target.closest('#features') && entry.target.classList.contains('flip-card')
          if (isFeatureCard) {
            if (entry.target.classList.contains('animate-slideInFromLeft')) {
              entry.target.style.animation = 'slideInFromLeft 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94) reverse forwards'
            } else if (entry.target.classList.contains('animate-slideInFromRight')) {
              entry.target.style.animation = 'slideInFromRight 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94) reverse forwards'
            } else if (entry.target.classList.contains('animate-slideInFromBottom')) {
              entry.target.style.animation = 'slideInFromBottom 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94) reverse forwards'
            }
          } else {
            // Reset when out of view - but keep them visible once they've been shown
            if (!entry.target.classList.contains('scroll-visible')) {
              entry.target.style.animation = 'none'
            }
          }
        }
      })
    },
    {
      threshold: 0.05, // Reduced from 0.1 for faster triggering
      rootMargin: '0px 0px -20px 0px'
    }
  )

  // Observe all elements with scroll-hidden class immediately
  const elementsToObserve = document.querySelectorAll('.scroll-hidden')
  elementsToObserve.forEach((el) => observer.observe(el))
  
  // Lazy load hero background image
  if (heroSectionRef.value) {
    const heroImageObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !heroImageLoaded.value) {
            // Preload the image
            const img = new Image()
            img.onload = () => {
              heroImageLoaded.value = true
            }
            img.src = '/images/hero-fashion-outfit.jpg'
            heroImageObserver.disconnect()
          }
        })
      },
      {
        threshold: 0.1,
        rootMargin: '200px' // Start loading 200px before visible
      }
    )
    heroImageObserver.observe(heroSectionRef.value)
  }

  // Observe carousel visibility - pause when not visible
  if (carouselWrapperRef.value) {
    carouselObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          isCarouselVisible.value = entry.isIntersecting
        })
      },
      {
        threshold: 0.1,
        rootMargin: '100px'
      }
    )
    carouselObserver.observe(carouselWrapperRef.value)
  }

  // Intersection Observer for avatar section - start rotation when visible
  await nextTick()
  if (avatarSectionRef.value) {
    avatarObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          isAvatarVisible.value = entry.isIntersecting
        })
      },
      {
        threshold: 0.3, // Start rotation when 30% of avatar section is visible
        rootMargin: '0px'
      }
    )
    avatarObserver.observe(avatarSectionRef.value)
  }
  
  // Load catalogue items for demo
  loadCatalogueItems()
  
  // No longer normalizing section heights - sections use natural heights with sufficient padding
  
  // Add keyboard navigation for carousel
  window.addEventListener('keydown', handleKeyboardNavigation)
  
  // Cleanup function
  onUnmounted(() => {
    // Clean up avatar observer
    if (avatarObserver && avatarSectionRef.value) {
      avatarObserver.unobserve(avatarSectionRef.value)
      avatarObserver.disconnect()
      avatarObserver = null
    }
    // Clean up carousel observer
    if (carouselObserver && carouselWrapperRef.value) {
      carouselObserver.unobserve(carouselWrapperRef.value)
      carouselObserver.disconnect()
      carouselObserver = null
    }
    // Cancel pending RAF
    if (carouselRafId) {
      cancelAnimationFrame(carouselRafId)
      carouselRafId = null
    }
    if (scrollRafId) {
      cancelAnimationFrame(scrollRafId)
      scrollRafId = null
    }
    // Clear footer debounce timer
    if (footerDebounceTimer) {
      clearTimeout(footerDebounceTimer)
      footerDebounceTimer = null
    }
    // Ensure body scroll is re-enabled when component is unmounted
    enableBodyScroll()
    window.removeEventListener('scroll', handleScroll)
    window.removeEventListener('keydown', handleKeyboardNavigation)
    observer.disconnect()
  })
})

const setScrollY = (value) => {
  scrollY.value = value
}
</script>

<style scoped>
/* Apple-style Splash Screen */
.splash-screen {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: #000000;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  transition: opacity 1s ease-out;
}

.splash-transitioning {
  pointer-events: none;
}

.splash-fading {
  opacity: 0;
  transition: opacity 0.8s ease-out;
}

/* Transition fade animations */
.splash-fade-enter-active,
.splash-fade-leave-active {
  transition: opacity 0.8s ease-out;
}

.splash-fade-enter-from,
.splash-fade-leave-to {
  opacity: 0;
}

.splash-fade-enter-to,
.splash-fade-leave-from {
  opacity: 1;
}

.splash-title {
  font-size: 2.8rem;
  font-weight: 700;
  color: #ffffff;
  letter-spacing: normal; /* Match hero title from start */
  text-align: center;
  padding: 0 2rem; /* Restore padding for visual spacing */
  transition: transform 1000ms ease-out,
              color 1000ms ease-out,
              letter-spacing 1000ms ease-out,
              line-height 1000ms ease-out;
  max-width: 90vw; /* Allow some padding on edges */
  width: auto; /* Auto width to accommodate padding */
  transform-origin: center center;
  line-height: 1.2;
  /* Preserve text layout */
  white-space: normal;
  word-wrap: break-word;
  overflow-wrap: break-word;
  /* Mobile optimizations */
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

@media (min-width: 768px) {
  .splash-title:not(.splash-title-moving):not(.splash-title-frozen) {
    font-size: 3.6rem;
  }
  
  .splash-title-moving {
    font-size: 3.6rem;
  }
  
  .splash-title-frozen {
    font-size: 3.6rem !important;
  }
}

@media (min-width: 1024px) {
  .splash-title:not(.splash-title-moving):not(.splash-title-frozen) {
    font-size: 4rem;
  }
  
  .splash-title-moving {
    font-size: 4rem;
  }
  
  .splash-title-frozen {
    font-size: 4rem !important;
  }
}

.splash-title-moving {
  /* Apply final styling that transitions smoothly - match hero title exactly */
  font-weight: 700 !important;
  color: #ffffff !important;
  letter-spacing: normal !important;
  line-height: 1.2 !important;
  text-align: center !important;
  /* Match hero title width constraints but preserve padding */
  max-width: 90vw !important;
  width: auto !important;
  /* Preserve text layout */
  white-space: normal !important;
  word-wrap: break-word !important;
  overflow-wrap: break-word !important;
  /* Keep padding for visual spacing - match hero container padding */
  padding: 0 2rem !important;
  /* Lock position */
  position: fixed !important;
  z-index: 10001 !important;
  pointer-events: none !important;
  /* No margin that could shift */
  margin: 0 !important;
  /* Ensure transform origin is centered for accurate alignment */
  transform-origin: center center !important;
  /* Use GPU acceleration for smoother mobile performance */
  will-change: transform;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  transform: translateZ(0);
  -webkit-transform: translateZ(0);
}

.splash-title-frozen {
  /* NUCLEAR FREEZE - absolutely NOTHING can change */
  transition: none !important;
  animation: none !important;
  will-change: auto !important;
  /* Keep font size constant - don't change it, match hero title responsive size */
  font-weight: 700 !important;
  color: #ffffff !important;
  letter-spacing: normal !important;
  line-height: 1.2 !important;
  text-align: center !important;
  /* Match hero title width constraints but preserve padding */
  max-width: 90vw !important;
  width: auto !important;
  /* Preserve text layout */
  white-space: normal !important;
  word-wrap: break-word !important;
  overflow-wrap: break-word !important;
  /* Keep padding for visual spacing */
  padding: 0 2rem !important;
  /* Lock position exactly where it is */
  position: fixed !important;
  /* Force exact values from CSS variables */
  transform: translate(var(--target-x), var(--target-y)) !important;
  /* Block any potential parent influences */
  isolation: isolate !important;
  transform-origin: center center !important;
  /* No margin */
  margin: 0 !important;
  /* Remove GPU acceleration after transition */
  backface-visibility: auto !important;
  -webkit-backface-visibility: auto !important;
}

.typewriter-cursor-splash {
  animation: blink 1s step-end infinite;
  margin-left: 2px;
  color: #ffffff;
}

/* Skip Animation Button */
.skip-animation-btn {
  position: absolute;
  bottom: 2rem;
  left: 50%;
  transform: translateX(-50%);
  background: white;
  color: black;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 9999px;
  padding: 10px 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  z-index: 10001;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
}

.skip-animation-btn:hover {
  transform: translateX(-50%) scale(1.05);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  background: #f5f5f5;
}

.skip-animation-btn:active {
  transform: translateX(-50%) scale(0.98);
}

/* Landing page hidden/visible states */
.page-hidden {
  opacity: 0;
  pointer-events: none;
}

.page-visible {
  opacity: 1;
  animation: fadeInPage 1s ease-out;
}

@keyframes fadeInPage {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* Hero title styling */
.hero-title {
  font-size: 2.8rem;
  font-weight: 700;
  color: #ffffff !important;
  position: relative;
  opacity: 0;
  transition: opacity 0.5s ease-in;
  letter-spacing: normal;
  line-height: 1.2;
  text-align: center;
  /* Preserve text layout - match splash title */
  white-space: normal;
  word-wrap: break-word;
  overflow-wrap: break-word;
  width: 100%;
}

@media (min-width: 768px) {
  .hero-title {
    font-size: 3.6rem;
  }
}

@media (min-width: 1024px) {
  .hero-title {
    font-size: 4rem;
  }
}

.hero-title-visible {
  opacity: 1 !important;
}

/* CTA Title - matches hero title styling except color */
.cta-title {
  font-size: 2.8rem;
  font-weight: 700;
  color: #111827 !important; /* text-gray-900 */
  position: relative;
  letter-spacing: normal;
  line-height: 1.2;
  text-align: center;
  /* Allow text to wrap naturally */
  white-space: normal;
  word-wrap: break-word;
  overflow-wrap: break-word;
  width: 100%;
  max-width: 100%;
  padding: 0 1rem;
}

@media (min-width: 768px) {
  .cta-title {
    font-size: 3.6rem;
  }
}

@media (min-width: 1024px) {
  .cta-title {
    font-size: 4rem;
  }
}

/* Hero section text - ensure white color */
.hero-section h1,
.hero-section p {
  color: #ffffff !important;
}

/* Hero section container */
.hero-section {
  color: #ffffff !important;
}

/* Typewriter cursor animation */
.typewriter-cursor {
  animation: blink 1s step-end infinite;
  margin-left: 2px;
  background: linear-gradient(135deg, #1a1a1a 0%, #000000 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

@keyframes blink {
  from, to {
    opacity: 1;
  }
  50% {
    opacity: 0;
  }
}

/* Force landing page to always use light mode colors on all devices */
.landing-page,
.landing-page * {
  color-scheme: light only;
}

/* Force navigation pill to always use light mode */
.landing-nav-pill > div {
  background-color: rgba(243, 244, 246, 0.85) !important;
  /* Reduce blur for better performance */
  backdrop-filter: blur(8px) !important;
  -webkit-backdrop-filter: blur(8px) !important;
  border-color: rgba(229, 231, 235, 0.5) !important;
}

/* Ensure consistent padding with safe-area-inset support for devices with notches */
.landing-nav-container {
  padding-left: max(1.5rem, calc(1.5rem + env(safe-area-inset-left))) !important;
  padding-right: max(1.5rem, calc(1.5rem + env(safe-area-inset-right))) !important;
}

@media (min-width: 768px) {
  .landing-nav-container {
    padding-left: max(1.25rem, calc(1.25rem + env(safe-area-inset-left))) !important;
    padding-right: max(1.25rem, calc(1.25rem + env(safe-area-inset-right))) !important;
  }
}

/* Force logo to always be black in navigation bar, independent of theme */
.landing-nav-pill .stylesnap-logo {
  filter: none !important;
}

/* Ensure logo stays black even in dark mode */
.dark .landing-nav-pill .stylesnap-logo {
  filter: none !important;
}

.landing-nav-pill a,
.landing-nav-pill button,
.landing-nav-pill span {
  color: rgb(17, 24, 39) !important;
}

/* Exception for "Join for free" button - keep white text */
.landing-nav-pill button[class*="bg-black"] span,
.landing-nav-pill button[class*="bg-black"] {
  color: #ffffff !important;
}

.landing-nav-pill a:hover,
.landing-nav-pill button:hover {
  color: rgb(75, 85, 99) !important;
}

/* Exception for "Join for free" button hover */
.landing-nav-pill button[class*="bg-black"]:hover {
  color: #ffffff !important;
}

/* Ensure mobile menu also stays light */
.landing-nav-pill [class~="md:hidden"] {
  background-color: rgba(243, 244, 246, 0.85) !important;
  /* Reduce blur for better performance */
  backdrop-filter: blur(8px) !important;
  -webkit-backdrop-filter: blur(8px) !important;
  border-color: rgba(229, 231, 235, 0.5) !important;
}

/* Landing sections use natural heights with sufficient padding */
.landing-section,
.cta-card-section {
  /* Sections use natural content height with appropriate padding */
}

.landing-page h1,
.landing-page h2,
.landing-page h3,
.landing-page h4,
.landing-page h5,
.landing-page h6 {
  color: inherit !important;
}

.landing-page p {
  color: inherit !important;
}

/* Override dark mode if device has it enabled */
@media (prefers-color-scheme: dark) {
  .landing-page {
    background-color: white !important;
    color: rgb(17, 24, 39) !important;
  }
  
  /* Ensure hero section stays white */
  .landing-page .hero-section,
  .landing-page .hero-section * {
    color: #ffffff !important;
  }
}

/* 3D Carousel Styles */
.carousel-3d-wrapper {
  perspective: 800px; /* Reduced from 1200px for better performance */
  perspective-origin: center center;
  width: 100%;
  height: 320px;
  position: relative;
  margin: 4rem 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none; /* Allow clicks to pass through to cards */
  contain: layout style paint; /* Isolate rendering */
  overflow: hidden; /* Prevent cards from being cut off */
}

.carousel-3d-wrapper > * {
  pointer-events: auto; /* Re-enable for carousel container */
}

.carousel-3d-container {
  position: relative;
  width: 200px;
  height: 240px;
  transform-style: preserve-3d;
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  will-change: transform; /* Only when actively rotating */
}

.carousel-3d-wrapper:not(.carousel-active) .carousel-3d-container {
  will-change: auto; /* Remove will-change when not rotating */
}

.carousel-3d-item {
  position: absolute;
  width: 180px;
  height: 220px;
  left: 50%;
  top: 50%;
  margin-left: -90px;
  margin-top: -110px;
  transform-style: preserve-3d;
  transition: transform 0.5s ease, z-index 0.5s ease;
  cursor: pointer;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  contain: layout style paint; /* Isolate rendering */
}

/* Enable pointer events for all cards - click detection handled by JS */
.carousel-3d-item {
  pointer-events: auto;
}

.carousel-3d-item.expanded {
  z-index: 10;
  transform: translateZ(300px) scale(1.1) !important;
}

.carousel-3d-item.expanded .carousel-card {
  max-height: 400px;
  overflow-y: auto;
}

.carousel-card-wrapper {
  width: 100%;
  height: 100%;
  position: relative;
  transform-style: preserve-3d;
  transition: transform 0.6s ease;
  pointer-events: auto; /* Ensure wrapper can receive clicks */
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

.carousel-card-wrapper.flipped {
  transform: rotateY(180deg);
}

.carousel-card-face {
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  transform-style: preserve-3d;
  pointer-events: none; /* Let clicks pass through to parent */
}

.carousel-card-front {
  transform: rotateY(0deg);
}

.carousel-card-back {
  transform: rotateY(180deg);
  background-color: #ffffff !important;
}

/* Hide text on back face when card is not flipped (viewed from carousel rotation) */
.carousel-card-wrapper:not(.flipped) .carousel-card-back {
  color: transparent !important;
}

.carousel-card-wrapper:not(.flipped) .carousel-card-back * {
  opacity: 0 !important;
  visibility: hidden !important;
}

/* Show text and white background when card is intentionally flipped */
.carousel-card-wrapper.flipped .carousel-card-back {
  background-color: #ffffff !important;
  color: #000000 !important;
}

.carousel-card-wrapper.flipped .carousel-card-back * {
  opacity: 1 !important;
  visibility: visible !important;
}

.carousel-card-wrapper:hover:not(.flipped) .carousel-card-front {
  transform: translateY(-8px) rotateY(0deg);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
}

.expanded-content {
  transition: max-height 0.5s ease, opacity 0.5s ease;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .carousel-3d-wrapper {
    height: 260px;
    margin: 2rem 0;
  }
  
  .carousel-3d-container {
    width: 170px;
    height: 210px;
  }
  
  .carousel-3d-item {
    width: 150px;
    height: 190px;
    margin-left: -75px;
    margin-top: -95px;
  }
  
  .carousel-3d-item.expanded {
    transform: translateZ(260px) !important;
  }
}

@media (max-width: 640px) {
  .carousel-3d-wrapper {
    height: 220px;
    margin: 1.5rem 0;
  }
  
  .carousel-3d-container {
    width: 150px;
    height: 180px;
  }
  
  .carousel-3d-item {
    width: 130px;
    height: 160px;
    margin-left: -65px;
    margin-top: -80px;
  }
  
  .carousel-3d-item.expanded {
    transform: translateZ(220px) !important;
  }
}

/* Carousel Slider */
.carousel-slider {
  -webkit-appearance: none;
  appearance: none;
  height: 6px;
  background: linear-gradient(to right, #e5e7eb 0%, #9ca3af 50%, #e5e7eb 100%);
  border-radius: 3px;
  outline: none;
  cursor: pointer;
  transition: background 0.3s ease;
}

.carousel-slider:hover {
  background: linear-gradient(to right, #d1d5db 0%, #6b7280 50%, #d1d5db 100%);
}

.carousel-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 20px;
  height: 20px;
  background: #000;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.carousel-slider::-webkit-slider-thumb:hover {
  transform: scale(1.1);
  box-shadow: 0 3px 6px rgba(0, 0, 0, 0.3);
}

.carousel-slider::-moz-range-thumb {
  width: 20px;
  height: 20px;
  background: #000;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  border: none;
}

.carousel-slider::-moz-range-thumb:hover {
  transform: scale(1.1);
  box-shadow: 0 3px 6px rgba(0, 0, 0, 0.3);
}

/* Join for free button animations */
.join-for-free-btn {
  transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.join-button-enter {
  opacity: 1;
  transform: translateX(0) scale(1);
  padding-left: 1rem;
  padding-right: 1rem;
  margin-left: 0.5rem;
  width: auto;
  max-width: 200px;
}

.join-button-exit {
  opacity: 0;
  transform: translateX(20px) scale(0.8);
  padding-left: 0;
  padding-right: 0;
  margin-left: 0;
  width: 0;
  max-width: 0;
  pointer-events: none;
}

/* CTA Card Section */
.cta-card-section {
  margin-bottom: 0; /* Remove negative margin for equal spacing */
  border-radius: 0; /* Remove all rounded corners */
  z-index: 10;
  position: relative;
  background-color: white;
}

@media (min-width: 768px) {
  .cta-card-section {
    border-radius: 0; /* Remove all rounded corners on desktop too */
  }
}

/* CTA Sign Up Button - Matches site's black/white theme */
.cta-signup-button {
  /* Uses Tailwind classes: bg-black text-white hover:bg-gray-900 */
  /* No custom styling needed - matches "Join for free" button styling */
}

/* Footer - Static at bottom of content */
.footer-static {
  position: relative;
  width: 100%;
  margin-top: 0;
  z-index: 1;
  /* Ensure footer is always visible and at bottom */
  display: block;
  clear: both;
  /* Ensure footer doesn't get clipped */
  overflow: visible;
}

/* Force footer logo to be white */
.footer-static .footer-logo-white.stylesnap-logo {
  filter: brightness(0) invert(1) !important;
}

/* Ensure footer appears below all content sections */
.landing-page {
  /* Normal document flow - footer will appear after all sections */
}

/* Fade-in transition for hover indicator */
.fade-in-enter-active {
  transition: all 0.3s ease-out;
}

.fade-in-leave-active {
  transition: all 0.3s ease-in;
}

.fade-in-enter-from {
  opacity: 0;
  transform: translateY(-5px) scale(0.95);
}

.fade-in-leave-to {
  opacity: 0;
  transform: translateY(-5px) scale(0.95);
}

.fade-in-enter-to,
.fade-in-leave-from {
  opacity: 1;
  transform: translateY(0) scale(1);
}
</style>

