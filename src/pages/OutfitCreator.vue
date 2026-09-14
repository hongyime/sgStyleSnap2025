<template>
  <!-- Full-screen loading for friend outfit creation -->
  <div v-if="currentSubRoute === 'friend' && (loadingWardrobeItems || loadingFriendProfile)" class="min-h-screen flex flex-col items-center justify-center bg-background">
    <div class="w-16 h-16 spinner-modern mb-4"></div>
    <p class="text-base text-stone-600 dark:text-zinc-400">Loading...</p>
  </div>

  <!-- Main Content -->
  <div v-else class="min-h-screen p-4 md:p-12 bg-background max-w-full overflow-x-hidden">
    <div class="max-w-7xl mx-auto">
      <!-- Header -->
      <div class="mb-8">
        <!-- Desktop Layout -->
        <div class="hidden md:flex items-start justify-between">
          <div>
            <h1 class="text-4xl font-bold mb-2 text-foreground">
              {{ subRouteTitle }}
            </h1>
            <p v-if="currentSubRoute === 'edit'" class="text-lg text-stone-600 dark:text-zinc-400">
              Make changes to your saved outfit
            </p>
          </div>
          
          <!-- Navigation Buttons (AI Suggestions, Personal Creation, Friend Creation) -->
          <div v-if="currentSubRoute !== 'default' && currentSubRoute !== 'edit'" class="flex items-center gap-2 flex-shrink-0">
            <button
              @click="$router.push('/outfits/add/suggested')"
              :class="`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                currentSubRoute === 'suggested'
                  ? 'bg-black text-white dark:bg-white dark:text-black shadow-md'
                  : 'bg-white text-stone-700 hover:bg-stone-100 border border-stone-200 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-800 dark:hover:bg-zinc-800'
              }`"
            >
              <Sparkles class="w-4 h-4" />
              AI Suggestions
            </button>
            <button
              @click="$router.push('/outfits/add/personal')"
              :class="`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                currentSubRoute === 'personal'
                  ? 'bg-black text-white dark:bg-white dark:text-black shadow-md'
                  : 'bg-white text-stone-700 hover:bg-stone-100 border border-stone-200 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-800 dark:hover:bg-zinc-800'
              }`"
            >
              <User class="w-4 h-4" />
              Personal Creation
            </button>
            <button
              @click="$router.push('/outfits/add/friend')"
              :class="`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                currentSubRoute === 'friend' || currentSubRoute === 'friendSelect'
                  ? 'bg-black text-white dark:bg-white dark:text-black shadow-md'
                  : 'bg-white text-stone-700 hover:bg-stone-100 border border-stone-200 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-800 dark:hover:bg-zinc-800'
              }`"
            >
              <Users class="w-4 h-4" />
              Friend Creation
            </button>
          </div>
          
          <!-- Action Buttons (moved into canvas; hidden here) -->
          <div v-if="false" class="flex items-center gap-3">
          <button
            @click="undoAction"
            :disabled="!canUndo"
            :class="`p-3 rounded-lg transition-all duration-200 ${
              canUndo
                ? 'bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                : 'opacity-50 cursor-not-allowed'
            }`"
            title="Undo"
          >
            <Undo class="w-5 h-5" />
          </button>
          
          <button
            @click="redoAction"
            :disabled="!canRedo"
            :class="`p-3 rounded-lg transition-all duration-200 ${
              canRedo
                ? 'bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                : 'opacity-50 cursor-not-allowed'
            }`"
            title="Redo"
          >
            <Redo class="w-5 h-5" />
          </button>
          
          <button
            @click="toggleGrid"
            :class="`p-3 rounded-lg transition-all duration-200 ${
              showGrid
                ? 'bg-black text-white dark:bg-white dark:text-black'
                : 'bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
            }`"
            title="Toggle Grid"
          >
            <Grid3X3 class="w-5 h-5" />
          </button>
          
          <button
            @click="clearCanvas"
            :disabled="canvasItems.length === 0"
            :class="`p-3 rounded-lg transition-all duration-200 flex items-center gap-2 ${
              canvasItems.length > 0
                ? 'bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                : 'opacity-50 cursor-not-allowed'
            }`"
            title="Clear Canvas"
          >
            <Trash2 class="w-5 h-5" />
            <span class="hidden sm:inline">Clear</span>
          </button>
          
          <!-- Save button - shown first on mobile, second on desktop -->
          <button
            @click="saveOutfit"
            :disabled="canvasItems.length < 2 || savingOutfit"
            :class="`px-6 py-3 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 ${
              canvasItems.length >= 2 && !savingOutfit
                ? 'bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                : 'opacity-50 cursor-not-allowed'
            }`"
          >
            <Share2 v-if="currentSubRoute === 'friend'" class="w-5 h-5" />
            <Save v-else class="w-5 h-5" />
            <span class="hidden sm:inline">{{ saveButtonLabel }}</span>
          </button>
          
          <!-- Show Outfit on Model button -->
          <button
            @click="showVirtualTryOn"
            :disabled="!canShowVirtualTryOn"
            :class="`px-6 py-3 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 gradient-button-shimmer ${
              canShowVirtualTryOn
                ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600 shadow-lg'
                : 'opacity-50 cursor-not-allowed bg-stone-300 dark:bg-zinc-700'
            }`"
            :title="virtualTryOnMatchesCanvas && virtualTryOnImageUrl ? 'View Virtual Try-On Result' : 'Show Outfit on AI Model Person'"
          >
            <Eye v-if="virtualTryOnMatchesCanvas && virtualTryOnImageUrl" class="w-5 h-5" />
            <User v-else class="w-5 h-5" />
            <span class="hidden sm:inline whitespace-nowrap">
              <span v-if="generatingTryOn" class="ellipsis-animated">Generating</span>
              <span v-else-if="virtualTryOnMatchesCanvas && virtualTryOnImageUrl">View</span>
              <span v-else>Try On</span>
            </span>
          </button>
          
          <!-- Generate AI button (only shown on suggested route) -->
          <button
            v-if="currentSubRoute === 'suggested'"
            @click="getAIRecommendations"
            :disabled="recommendingOutfits || wardrobeItems.length < 2"
            :class="`px-6 py-3 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 ${
              !recommendingOutfits && wardrobeItems.length >= 2
                ? 'bg-purple-500 text-white hover:bg-purple-600 dark:bg-purple-600 dark:hover:bg-purple-500'
                : 'opacity-50 cursor-not-allowed'
            }`"
            title="Generate AI Outfit Based on Score"
          >
            <Sparkles class="w-5 h-5" />
            <span class="hidden sm:inline">
              <span v-if="recommendingOutfits" class="ellipsis-animated">Generating</span>
              <span v-else>Generate</span>
            </span>
          </button>
          
          <!-- Weather button (only shown on suggested route) -->
          <button
            v-if="currentSubRoute === 'suggested'"
            @click="generateWeatherBasedOutfit"
            :disabled="generatingWeatherOutfit || wardrobeItems.length < 2"
            :class="`px-6 py-3 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 ${
              !generatingWeatherOutfit && wardrobeItems.length >= 2
                ? 'bg-blue-500 text-white hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-500'
                : 'opacity-50 cursor-not-allowed'
            }`"
            title="Generate Weather-Based Outfit Recommendations"
          >
            <CloudSun class="w-5 h-5" />
            <span class="hidden sm:inline">
              <span v-if="generatingWeatherOutfit" class="ellipsis-animated">Loading Weather</span>
              <span v-else>Weather</span>
            </span>
          </button>
          
        </div>
        </div>

        <!-- Mobile Layout -->
        <div class="md:hidden">
          <h1 class="text-3xl font-bold mb-2 text-foreground text-center">
            {{ subRouteTitle }}
          </h1>
          <p v-if="currentSubRoute === 'edit'" class="text-base mb-4 text-stone-600 dark:text-zinc-400">
            Make changes to your saved outfit
          </p>
          
          <!-- Action Buttons (moved into canvas; hidden here) -->
          <div v-if="false" class="flex items-center gap-2 flex-wrap">
            <button
              @click="undoAction"
              :disabled="!canUndo"
              :class="`p-2 rounded-lg transition-all duration-200 ${
                canUndo
                  ? 'bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                  : 'opacity-50 cursor-not-allowed'
              }`"
              title="Undo"
            >
              <Undo class="w-4 h-4" />
            </button>
            
            <button
              @click="redoAction"
              :disabled="!canRedo"
              :class="`p-2 rounded-lg transition-all duration-200 ${
                canRedo
                  ? 'bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                  : 'opacity-50 cursor-not-allowed'
              }`"
              title="Redo"
            >
              <Redo class="w-4 h-4" />
            </button>
            
            <button
              @click="toggleGrid"
              :class="`p-2 rounded-lg transition-all duration-200 ${
                showGrid
                  ? 'bg-black text-white dark:bg-white dark:text-black'
                  : 'bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
              }`"
              title="Toggle Grid"
            >
              <Grid3X3 class="w-4 h-4" />
            </button>
            
            <button
              @click="clearCanvas"
              :disabled="canvasItems.length === 0"
              :class="`p-2 rounded-lg transition-all duration-200 flex items-center gap-1 ${
                canvasItems.length > 0
                  ? 'bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                  : 'opacity-50 cursor-not-allowed'
              }`"
              title="Clear Canvas"
            >
              <Trash2 class="w-4 h-4" />
              <span class="text-xs">Clear</span>
            </button>
            
            <!-- Show Outfit on Model button -->
            <button
              @click.stop="showVirtualTryOn"
              :disabled="!canShowVirtualTryOn"
              :class="`px-3 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-1 gradient-button-shimmer ${
                canShowVirtualTryOn
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600'
                  : 'opacity-50 cursor-not-allowed bg-stone-300 dark:bg-zinc-700'
              }`"
              style="touch-action: manipulation; -webkit-tap-highlight-color: transparent;"
              :title="virtualTryOnMatchesCanvas && virtualTryOnImageUrl ? 'View Virtual Try-On Result' : 'Show Outfit on AI Model Person'"
            >
              <Eye v-if="virtualTryOnMatchesCanvas && virtualTryOnImageUrl" class="w-4 h-4" />
              <User v-else class="w-4 h-4" />
              <span class="text-xs whitespace-nowrap">
                <span v-if="generatingTryOn" class="ellipsis-animated">Generating</span>
                <span v-else-if="virtualTryOnMatchesCanvas && virtualTryOnImageUrl">View</span>
                <span v-else>Try On</span>
              </span>
            </button>
            
            <!-- Generate AI button (only in AI mode) -->
            <button
              v-if="currentSubRoute === 'suggested'"
              @click.stop="getAIRecommendations"
              :disabled="recommendingOutfits || wardrobeItems.length < 2"
              :class="`px-3 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-1 ${
                !recommendingOutfits && wardrobeItems.length >= 2
                  ? 'bg-purple-500 text-white hover:bg-purple-600 dark:bg-purple-600 dark:hover:bg-purple-500'
                  : 'opacity-50 cursor-not-allowed'
              }`"
              style="touch-action: manipulation; -webkit-tap-highlight-color: transparent;"
              title="Generate AI Outfit Based on Score"
            >
              <Sparkles class="w-4 h-4" />
              <span class="text-xs">
                <span v-if="recommendingOutfits" class="ellipsis-animated">Generating</span>
                <span v-else>Generate</span>
              </span>
            </button>
            
            <!-- Weather Recommended button (only in AI mode) -->
            <button
              v-if="currentSubRoute === 'suggested'"
              @click.stop="generateWeatherBasedOutfit"
              :disabled="generatingWeatherOutfit || wardrobeItems.length < 2"
              :class="`px-3 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-1 ${
                !generatingWeatherOutfit && wardrobeItems.length >= 2
                  ? 'bg-blue-500 text-white hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-500'
                  : 'opacity-50 cursor-not-allowed'
              }`"
              style="touch-action: manipulation; -webkit-tap-highlight-color: transparent;"
              title="Generate Weather-Based Outfit Recommendations"
            >
              <CloudSun class="w-4 h-4" />
              <span class="text-xs">
                <span v-if="generatingWeatherOutfit" class="ellipsis-animated">Loading</span>
                <span v-else>Weather</span>
              </span>
            </button>
            
            <button
              @click="saveOutfit"
              :disabled="canvasItems.length < 2 || savingOutfit"
              :class="`px-3 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-1 ${
                canvasItems.length >= 2 && !savingOutfit
                  ? 'bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                  : 'opacity-50 cursor-not-allowed'
              }`"
            >
              <Share2 v-if="currentSubRoute === 'friend'" class="w-4 h-4" />
              <Save v-else class="w-4 h-4" />
              <span class="text-xs">{{ saveButtonLabel }}</span>
            </button>
          </div>
        </div>
      </div>
      
      <!-- Sub-route Navigation (Mobile only - buttons moved to header on desktop) -->
      <div v-if="currentSubRoute !== 'default' && currentSubRoute !== 'edit'" class="mb-8 md:hidden">
        <!-- Mobile: Stack buttons vertically -->
        <div class="flex flex-col gap-2">
          <button
            @click="$router.push('/outfits/add/suggested')"
            :class="`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
              currentSubRoute === 'suggested'
                ? 'bg-black text-white dark:bg-white dark:text-black shadow-md'
                : 'bg-white text-stone-700 hover:bg-stone-100 border border-stone-200 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-800 dark:hover:bg-zinc-800'
            }`"
          >
            <Sparkles class="w-4 h-4" />
            AI Suggestions
          </button>
          <button
            @click="$router.push('/outfits/add/personal')"
            :class="`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
              currentSubRoute === 'personal'
                ? 'bg-black text-white dark:bg-white dark:text-black shadow-md'
                : 'bg-white text-stone-700 hover:bg-stone-100 border border-stone-200 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-800 dark:hover:bg-zinc-800'
            }`"
          >
            <User class="w-4 h-4" />
            Personal Creation
          </button>
          <button
            @click="$router.push('/outfits/add/friend')"
            :class="`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
              currentSubRoute === 'friend' || currentSubRoute === 'friendSelect'
                ? 'bg-black text-white dark:bg-white dark:text-black shadow-md'
                : 'bg-white text-stone-700 hover:bg-stone-100 border border-stone-200 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-800 dark:hover:bg-zinc-800'
            }`"
          >
            <Users class="w-4 h-4" />
            Friend Creation
          </button>
        </div>
      </div>
      
      <!-- Sub-route Content (removed for cleaner UI) -->

      <!-- Friend Selection View (when no username is provided) -->
      <div v-if="currentSubRoute === 'friendSelect'">
        <!-- Loading State -->
        <div v-if="loadingFriends" class="flex flex-col items-center justify-center py-24">
          <div class="w-16 h-16 spinner-modern mb-4"></div>
          <p class="text-base text-stone-600 dark:text-zinc-400">Loading your friends...</p>
        </div>
        
        <!-- Friends List -->
        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div
          v-for="friend in friendsList"
          :key="friend.id"
          @click="selectFriend(friend)"
          :class="`group p-6 rounded-xl cursor-pointer transition-all duration-200 hover:scale-[1.02] bg-white border border-stone-200 hover:border-stone-300 dark:bg-zinc-900 dark:border-zinc-800 dark:hover:border-zinc-700`"
        >
          <div class="flex items-center gap-4">
            <!-- Friend Avatar -->
            <div class="w-16 h-16 rounded-full overflow-hidden flex-shrink-0 bg-stone-100 dark:bg-zinc-800">
              <img
                v-if="friend.avatar_url"
                :src="getProxiedImageUrl(friend.avatar_url)"
                :alt="friend.username"
                class="w-full h-full object-cover"
                crossorigin="anonymous"
              />
              <div class="w-full h-full flex items-center justify-center text-stone-400 dark:text-zinc-500">
                <User class="w-8 h-8" />
              </div>
            </div>
            
            <!-- Friend Info -->
            <div class="flex-1 min-w-0">
              <p class="text-lg font-semibold mb-1 text-black dark:text-white">
                {{ getFirstName(friend.name) || `@${friend.username}` }}
              </p>
              <p class="text-sm text-stone-600 dark:text-zinc-400">
                @{{ friend.username }}
              </p>
            </div>
            
            <!-- Arrow Icon -->
            <div class="opacity-0 group-hover:opacity-100 transition-opacity text-stone-400 dark:text-zinc-400">
              →
            </div>
          </div>
        </div>
        
        <!-- Empty State -->
        <div v-if="friendsList.length === 0" class="col-span-full text-center py-12">
          <div class="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center bg-stone-100 dark:bg-zinc-800">
            <Users class="w-8 h-8 text-stone-400 dark:text-zinc-600" />
          </div>
          <p class="text-lg font-medium mb-2 text-stone-700 dark:text-zinc-300">
            No friends yet
          </p>
          <p class="text-sm mb-4 text-stone-500 dark:text-zinc-500">
            Add friends to create outfit suggestions for them
          </p>
          
          <!-- Add Friend Button -->
          <button
            @click="showAddFriendModal = true"
            class="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all duration-200 hover:scale-105 mx-auto bg-black text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            <Plus class="w-5 h-5" />
            Add
          </button>
          </div>
        </div>
      </div>

      <!-- Main Content (Canvas View) -->
      <div v-else class="grid grid-cols-1 lg:grid-cols-5 gap-8">
        <!-- Left Sidebar - Item Selection -->
        <div class="lg:col-span-2">

          <!-- Items Section -->
          <div class="rounded-xl p-6 bg-white border border-stone-200 dark:bg-zinc-900 dark:border-zinc-800 flex flex-col" style="height: 600px;">
            <!-- Loading State -->
            <div v-if="loadingWardrobeItems || loadingFriendProfile" class="flex flex-col items-center justify-center py-24 flex-1">
              <div class="w-16 h-16 spinner-modern mb-4"></div>
              <p class="text-base text-stone-600 dark:text-zinc-400">Loading items...</p>
            </div>
            
            <!-- Content (when loaded) -->
            <template v-else>
              <div class="flex items-center justify-between mb-4 flex-shrink-0">
                <h3 class="text-lg font-bold text-black dark:text-white">
                  {{ itemsSectionTitle }}
                </h3>
                <span class="text-sm px-2 py-1 rounded-full bg-stone-100 text-stone-600 dark:bg-zinc-800 dark:text-zinc-400">
                  {{ filteredItems.length }}
                </span>
              </div>
              
              <!-- Category Filters -->
              <div class="flex flex-wrap gap-2 mb-4 flex-shrink-0">
                <button
                  v-for="category in categoryOptions"
                  :key="category"
                  @click="activeCategory = category"
                  :class="`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                    activeCategory === category
                      ? 'bg-black text-white dark:bg-white dark:text-black'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200 hover:text-stone-800 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-200'
                  }`"
                >
                  {{ category === 'all' ? 'All' : category.charAt(0).toUpperCase() + category.slice(1) }}
                </button>
              </div>

              <!-- Items List -->
              <div class="flex-1 overflow-y-auto px-2 pt-3 pb-3 custom-scrollbar min-h-0">
                <div v-if="filteredItems.length > 0" class="space-y-2 pt-2">
                  <div
                    v-for="item in filteredItems"
                    :key="item.id"
                    draggable="true"
                    @dragstart="handleDragStart(item, $event)"
                    @touchstart="handleWardrobeTouchStart(item, $event)"
                    @click="addItemToCanvas(item)"
                    @contextmenu.prevent="showItemContextMenu(item, $event)"
                    class="group p-3 rounded-xl cursor-grab active:cursor-grabbing transition-all duration-200 hover:scale-[1.02] bg-stone-50 hover:bg-stone-100 border border-stone-200 hover:border-stone-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:border-zinc-700 dark:hover:border-zinc-600 relative"
                    style="transform-origin: center; will-change: transform;"
                  >
                    <div class="flex items-center gap-3">
                      <!-- Item Image -->
                      <div class="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 shadow-sm bg-white dark:bg-zinc-900">
                        <ClothingImage
                          v-if="item.image_url"
                          :src="item.image_url"
                          :alt="item.name"
                          class="w-full h-full object-cover"
                          draggable="false"
                        />
                        <div class="w-full h-full flex items-center justify-center bg-stone-100 dark:bg-zinc-800">
                          <Shirt class="w-6 h-6 text-stone-400 dark:text-zinc-500" />
                        </div>
                      </div>
                      
                      <!-- Item Info -->
                      <div class="flex-1 min-w-0">
                        <p class="text-sm font-medium truncate mb-1 text-black dark:text-white">
                          {{ item.name }}
                        </p>
                        <p class="text-xs truncate capitalize text-stone-500 dark:text-zinc-400">
                          {{ item.category }}
                        </p>
                      </div>
                      
                      <!-- Add Icon -->
                      <div class="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-stone-500 dark:text-zinc-400">
                        <Plus class="w-5 h-5" />
                      </div>
                    </div>
                  </div>
                </div>
                
                <!-- Empty State -->
                <div v-else class="flex flex-col items-center justify-center h-full py-12">
                  <div class="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center bg-stone-100 dark:bg-zinc-800">
                    <Shirt v-if="itemsSource === 'my-cabinet'" class="w-8 h-8 text-stone-400 dark:text-zinc-600" />
                    <Users v-else-if="itemsSource === 'friends'" class="w-8 h-8 text-stone-400 dark:text-zinc-600" />
                    <Sparkles v-else class="w-8 h-8 text-stone-400 dark:text-zinc-600" />
                  </div>
                  <p class="text-sm font-medium mb-1 text-stone-700 dark:text-zinc-300">
                    {{ itemsSource === 'my-cabinet' ? 'No items in your closet' : 
                       itemsSource === 'friends' ? "No friend's items available" :
                       'No AI suggestions available' }}
                  </p>
                  <p class="text-xs text-stone-500 dark:text-zinc-500">
                    {{ itemsSource === 'my-cabinet' ? 'Add items to your closet to get started' : 
                       itemsSource === 'friends' ? 'Connect with friends to access their items' :
                       'AI suggestions are coming soon!' }}
                  </p>
                </div>
              </div>
            </template>
          </div>
        </div>

        <!-- Right Area - Outfit Canvas -->
        <div class="lg:col-span-3">
          <div class="rounded-xl overflow-hidden bg-white border border-stone-200 dark:bg-zinc-900 dark:border-zinc-800">
            <!-- Canvas Area -->
            <div
              ref="canvasContainer"
              class="relative w-full rounded-lg overflow-hidden bg-stone-50 dark:bg-zinc-800"
              style="height: 600px;"
              @drop="handleDrop"
              @dragover.prevent
              @dragenter.prevent
              @touchmove.prevent="handleCanvasTouchMove($event)"
              @touchend.prevent="handleCanvasTouchEnd($event)"
              @click="deselectItem"
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
                    linear-gradient(${theme.value === 'dark' ? '#ffffff' : '#000000'} 1px, transparent 1px),
                    linear-gradient(90deg, ${theme.value === 'dark' ? '#ffffff' : '#000000'} 1px, transparent 1px)
                  `,
                  backgroundSize: '40px 40px'
                }"
              />
              
              <!-- Canvas Items -->
              <div
                v-for="item in canvasItems"
                :key="item.id"
                :title="`${item.name}${item.category ? ` - ${item.category.charAt(0).toUpperCase() + item.category.slice(1)}` : ''}`"
                :style="{
                  position: 'absolute',
                  left: `${scalePosition(item.x, 'x')}px`,
                  top: `${scalePosition(item.y, 'y')}px`,
                  zIndex: draggedItem === item.id ? 50 : Math.max(2, (item.z_index || 2)) + (selectedItemId === item.id ? 1000 : 0),
                  transform: `rotate(${item.rotation || 0}deg) scale(${item.scale || 1})`,
                  transformOrigin: 'center center',
                  transition: draggedItem === item.id ? 'none' : 'all duration-200'
                }"
                :class="[
                  draggedItem === item.id ? 'cursor-grabbing select-none' : 'cursor-move select-none',
                  {
                    'ring-4 ring-blue-500 ring-offset-2': selectedItemId === item.id
                  }
                ]"
                @mousedown.stop="startDrag(item, $event)"
                @touchstart.stop.prevent="handleTouchStart(item, $event)"
                @click.stop="handleItemClick(item.id, $event)"
              >
                <div class="w-32 h-32 overflow-hidden">
                  <ClothingImage
                    v-if="item.image_url"
                    :src="item.image_url"
                    :alt="item.name"
                    class="w-full h-full object-contain"
                    draggable="false"
                  />
                  <div class="w-full h-full flex items-center justify-center bg-stone-200 dark:bg-zinc-700">
                    <Shirt class="w-12 h-12 text-stone-500 dark:text-zinc-400" />
                  </div>
                </div>

                <!-- Toolkit (shown when item is selected) -->
                <div
                  v-if="selectedItemId === item.id"
                  class="absolute -top-14 left-1/2 -translate-x-1/2 flex gap-0.5 p-1.5 rounded-lg shadow-lg backdrop-blur-sm bg-white/95 border border-stone-200 dark:bg-zinc-800/95 dark:border-zinc-700 opacity-100 transition-opacity duration-200 z-[100] pointer-events-auto"
                  @mousedown.stop
                  @click.stop
                >
                  <!-- Zoom Out -->
                  <button
                    @click.stop="scaleSelectedItem(-0.1)"
                    class="rounded h-7 w-7 transition-colors hover:bg-stone-100 dark:hover:bg-zinc-700"
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
                    class="rounded h-7 w-7 transition-colors hover:bg-stone-100 dark:hover:bg-zinc-700"
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
                    class="rounded h-7 w-7 transition-colors hover:bg-stone-100 dark:hover:bg-zinc-700"
                    title="Rotate Left"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mx-auto">
                      <path d="M2.5 2v6h6M2.66 15.57a10 10 0 1 0 .57-8.38"></path>
                    </svg>
                  </button>

                  <!-- Rotate Right -->
                  <button
                    @click.stop="rotateSelectedItem(15)"
                    class="rounded h-7 w-7 transition-colors hover:bg-stone-100 dark:hover:bg-zinc-700"
                    title="Rotate Right"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mx-auto">
                      <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38"></path>
                    </svg>
                  </button>

                  <!-- Move Forward -->
                  <button
                    @click.stop="moveSelectedItemForward"
                    class="rounded h-7 w-7 transition-colors hover:bg-stone-100 dark:hover:bg-zinc-700"
                    title="Move Forward"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mx-auto">
                      <polyline points="18 15 12 9 6 15"></polyline>
                    </svg>
                  </button>

                  <!-- Move Backward -->
                  <button
                    @click.stop="moveSelectedItemBackward"
                    class="rounded h-7 w-7 transition-colors hover:bg-stone-100 dark:hover:bg-zinc-700"
                    title="Move Backward"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mx-auto">
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </button>

                  <!-- Delete -->
                  <button
                    @click.stop="deleteSelectedItem"
                    class="rounded h-7 w-7 transition-colors hover:bg-red-200 text-red-600 dark:hover:bg-red-900/50 dark:text-red-400"
                    title="Delete"
                  >
                    <Trash2 class="w-3.5 h-3.5 mx-auto" />
                  </button>
                </div>
              </div>
              
              <!-- Mobile Tooltip -->
              <div
                v-if="tooltipItemId && !draggedItem"
                :style="{
                  position: 'absolute',
                  left: `${tooltipPosition.x}px`,
                  top: `${tooltipPosition.y}px`,
                  transform: 'translateX(-50%)',
                  zIndex: 10000,
                  pointerEvents: 'none'
                }"
                class="px-3 py-2 rounded-lg shadow-lg backdrop-blur-sm bg-black/90 text-white text-sm whitespace-nowrap dark:bg-black/90"
              >
                {{ getTooltipText(tooltipItemId) }}
              </div>
              
              <!-- Empty State -->
              <div
                v-if="canvasItems.length === 0"
                class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
              >
                <div class="w-24 h-24 rounded-full flex items-center justify-center mb-6 bg-stone-200 dark:bg-zinc-700">
                  <Sparkles class="w-12 h-12 text-stone-500 dark:text-zinc-400" />
                </div>
                <p class="text-xl font-medium mb-2 text-stone-700 dark:text-zinc-300">
                  {{ currentSubRoute === 'friend' ? "Start Creating Friend's Outfit" : "Start Creating Your Outfit" }}
                </p>
                <p class="text-sm text-stone-500 dark:text-zinc-500">
                  Click on items to add them to the canvas
                </p>
              </div>

              <!-- Top Center Buttons - Regenerate (suggested only) and Show on Model (personal, suggested & edit) -->
              <div
                v-if="currentSubRoute === 'personal' || currentSubRoute === 'suggested' || currentSubRoute === 'edit'"
                class="absolute top-4 left-1/2 -translate-x-1/2 z-[40] flex items-center gap-2 pointer-events-none"
              >
                <!-- Regenerate Button - Only for suggested route -->
                <button
                  v-if="currentSubRoute === 'suggested'"
                  @click.stop="generateAISuggestion"
                  @touchstart.stop.prevent="generateAISuggestion"
                  :disabled="wardrobeItems.length === 0"
                  :class="`px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 gradient-button-shimmer pointer-events-auto cursor-pointer ${
                    wardrobeItems.length > 0
                      ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600 shadow-lg'
                      : 'opacity-50 cursor-not-allowed bg-stone-300 dark:bg-zinc-700'
                  }`"
                  style="touch-action: manipulation; -webkit-tap-highlight-color: transparent; z-index: 41;"
                  title="Regenerate AI Outfit Suggestion"
                >
                  <Sparkles class="w-5 h-5" />
                  <span class="hidden sm:inline">Regenerate</span>
                </button>
                
                <!-- Weather Button - Only for suggested route -->
                <button
                  v-if="currentSubRoute === 'suggested'"
                  @click.stop="generateWeatherBasedOutfit"
                  @touchstart.stop.prevent="generateWeatherBasedOutfit"
                  :disabled="generatingWeatherOutfit || wardrobeItems.length < 2"
                  :class="`px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 gradient-button-shimmer pointer-events-auto cursor-pointer ${
                    !generatingWeatherOutfit && wardrobeItems.length >= 2
                      ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white hover:from-blue-600 hover:to-cyan-600 shadow-lg'
                      : 'opacity-50 cursor-not-allowed bg-stone-300 dark:bg-zinc-700'
                  }`"
                  style="touch-action: manipulation; -webkit-tap-highlight-color: transparent; z-index: 41;"
                  title="Generate Weather-Based Outfit"
                >
                  <CloudSun class="w-5 h-5" />
                  <span class="hidden sm:inline">
                    <span v-if="generatingWeatherOutfit" class="ellipsis-animated">Loading</span>
                    <span v-else>Weather</span>
                  </span>
                </button>
                
                <!-- Model Button -->
                <button
                  @click.stop="showVirtualTryOn"
                  @touchstart.stop.prevent="showVirtualTryOn"
                  :disabled="!canShowVirtualTryOn"
                  :class="`px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 gradient-button-shimmer pointer-events-auto cursor-pointer ${
                    canShowVirtualTryOn
                      ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600 shadow-lg'
                      : 'opacity-50 cursor-not-allowed bg-stone-300 dark:bg-zinc-700'
                  }`"
                  style="touch-action: manipulation; -webkit-tap-highlight-color: transparent; z-index: 41;"
                  :title="virtualTryOnMatchesCanvas && virtualTryOnImageUrl ? 'View Virtual Try-On Result' : 'Show Outfit on AI Model Person'"
                >
                  <Eye v-if="virtualTryOnMatchesCanvas && virtualTryOnImageUrl" class="w-5 h-5" />
                  <User v-else class="w-5 h-5" />
                  <span class="hidden sm:inline whitespace-nowrap">
                    <span v-if="generatingTryOn" class="ellipsis-animated">Generating</span>
                    <span v-else-if="virtualTryOnMatchesCanvas && virtualTryOnImageUrl">View</span>
                    <span v-else>Try On</span>
                  </span>
                </button>
              </div>

              <!-- Bottom-Center Canvas Toolbar -->
              <div class="absolute left-1/2 -translate-x-1/2 bottom-4 z-20 flex items-center gap-2 px-3 py-2 rounded-xl bg-white/90 border border-stone-200 shadow-sm backdrop-blur dark:bg-zinc-900/90 dark:border-zinc-700 pointer-events-auto">
                <button
                  @click.stop="undoAction"
                  @touchstart.stop.prevent="undoAction"
                  :disabled="!canUndo"
                  :class="`p-2 rounded-lg transition-all ${canUndo ? 'bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700' : 'opacity-50 cursor-not-allowed'}`"
                  title="Undo"
                  style="touch-action: manipulation; -webkit-tap-highlight-color: transparent;"
                >
                  <Undo class="w-4 h-4" />
                </button>
                <button
                  @click.stop="redoAction"
                  @touchstart.stop.prevent="redoAction"
                  :disabled="!canRedo"
                  :class="`p-2 rounded-lg transition-all ${canRedo ? 'bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700' : 'opacity-50 cursor-not-allowed'}`"
                  title="Redo"
                  style="touch-action: manipulation; -webkit-tap-highlight-color: transparent;"
                >
                  <Redo class="w-4 h-4" />
                </button>
                <button
                  @click.stop="toggleGrid"
                  @touchstart.stop.prevent="toggleGrid"
                  :class="`p-2 rounded-lg transition-all ${showGrid ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'}`"
                  title="Toggle Grid"
                  style="touch-action: manipulation; -webkit-tap-highlight-color: transparent;"
                >
                  <Grid3X3 class="w-4 h-4" />
                </button>
                <button
                  @click.stop="clearCanvas"
                  @touchstart.stop.prevent="clearCanvas"
                  :disabled="canvasItems.length === 0"
                  :class="`p-2 rounded-lg transition-all flex items-center gap-1 ${canvasItems.length > 0 ? 'bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700' : 'opacity-50 cursor-not-allowed'}`"
                  title="Clear Canvas"
                  style="touch-action: manipulation; -webkit-tap-highlight-color: transparent;"
                >
                  <Trash2 class="w-4 h-4" />
                </button>
                <button
                  @click.stop="saveOutfit"
                  @touchstart.stop.prevent="saveOutfit"
                  :disabled="canvasItems.length < 2 || savingOutfit"
                  :class="`px-3 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${canvasItems.length >= 2 && !savingOutfit ? 'bg-black text-white dark:bg-white dark:text-black' : 'opacity-50 cursor-not-allowed bg-stone-300 dark:bg-zinc-700'}`"
                  :title="currentSubRoute === 'friend' ? 'Share Outfit' : 'Save Outfit'"
                  style="touch-action: manipulation; -webkit-tap-highlight-color: transparent;"
                >
                  <Share2 v-if="currentSubRoute === 'friend'" class="w-4 h-4" />
                  <Save v-else class="w-4 h-4" />
                  <span class="hidden sm:inline">{{ saveButtonLabel }}</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
    
    <!-- Add Friend Dialog -->
    <AddFriendDialog 
      :isOpen="showAddFriendModal" 
      @close="showAddFriendModal = false"
      @friendRequestSent="handleFriendRequestSent"
    />
    
    <!-- Share Outfit Dialog -->
    <ShareOutfitDialog
      :isOpen="showShareOutfitDialog"
      :friendName="friendProfile?.name || friendProfile?.username || 'Friend'"
      @close="showShareOutfitDialog = false"
      @save="handleShareOutfit"
    />
    
    <!-- Virtual Try-On Modal -->
    <VirtualTryOnModal
      :isOpen="showVirtualTryOnModal"
      :generating="generatingTryOn"
      :generatedImageUrl="virtualTryOnImageUrl"
      :error="virtualTryOnError"
      @close="closeVirtualTryOnModal"
      @retry="retryVirtualTryOn"
    />
    
    <!-- Recommendations Modal -->
    <div
      v-if="showRecommendationsModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      @click.self="showRecommendationsModal = false"
    >
      <div class="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        <!-- Header -->
        <div class="flex items-center justify-between p-6 border-b border-stone-200 dark:border-zinc-800">
          <div>
            <h2 class="text-2xl font-bold text-black dark:text-white flex items-center gap-2">
              <Sparkles class="w-6 h-6 text-purple-500" />
              AI Outfit Recommendations
            </h2>
            <p class="text-sm text-stone-600 dark:text-zinc-400 mt-1">
              Based on your closet items
            </p>
          </div>
          <div class="flex items-center gap-2">
            <!-- ESC Key Hint (Desktop only) -->
            <div v-if="isDesktop" class="keyboard-hint-modal">
              <span class="keyboard-hint-key">ESC</span>
            </div>
            <button
              @click="showRecommendationsModal = false"
              class="p-2 rounded-lg transition-all bg-white/90 shadow-lg hover:bg-stone-100 text-stone-500 hover:text-black dark:bg-zinc-900/90 dark:hover:bg-zinc-800 dark:text-zinc-300 dark:hover:text-white"
              aria-label="Close dialog"
            >
              <X class="w-5 h-5" />
            </button>
          </div>
        </div>
        
        <!-- Content -->
        <div class="flex-1 overflow-y-auto p-6">
          <div v-if="recommendations.length === 0 && !recommendingOutfits" class="text-center py-12">
            <Sparkles class="w-16 h-16 mx-auto mb-4 text-stone-300 dark:text-zinc-700" />
            <p class="text-stone-600 dark:text-zinc-400">No recommendations found</p>
          </div>
          
          <div v-else-if="recommendingOutfits" class="text-center py-12">
            <div class="w-16 h-16 mx-auto mb-4 spinner-modern"></div>
            <p class="text-stone-600 dark:text-zinc-400">Analyzing your closet...</p>
          </div>
          
          <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div
              v-for="rec in recommendations"
              :key="rec.id"
              class="border border-stone-200 dark:border-zinc-800 rounded-xl p-4 hover:border-purple-300 dark:hover:border-purple-700 transition-colors bg-white dark:bg-zinc-900"
            >
              <!-- Score Badge -->
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2">
                  <span class="text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                    #{{ rec.rank }}
                  </span>
                  <span class="text-sm font-medium text-stone-600 dark:text-zinc-400">
                    {{ Math.round(rec.score * 100) }}% Match
                  </span>
                </div>
              </div>
              
              <!-- Items Grid -->
              <div class="grid grid-cols-2 gap-2 mb-3">
                <div
                  v-for="item in rec.items"
                  :key="item.id"
                  class="aspect-square rounded-lg overflow-hidden bg-stone-100 dark:bg-zinc-800"
                >
                  <ClothingImage
                    :src="item.image_url || item.thumbnail_url"
                    :alt="item.name"
                    class="w-full h-full object-cover"
                  />
                </div>
              </div>
              
              <!-- Item Names -->
              <div class="mb-3">
                <p class="text-xs text-stone-600 dark:text-zinc-400 truncate">
                  <span v-for="(item, index) in rec.items" :key="item.id">
                    {{ item.name }}<span v-if="index < rec.items.length - 1">, </span>
                  </span>
                </p>
              </div>
              
              <!-- Load Button -->
              <button
                @click="loadRecommendation(rec)"
                class="w-full py-2 rounded-lg bg-black text-white hover:bg-zinc-800 transition-colors text-sm font-medium"
              >
                See on canvas
              </button>
            </div>
          </div>
        </div>
        
        <!-- Footer -->
        <div class="p-4 border-t border-stone-200 dark:border-zinc-800 text-center">
          <p class="text-xs text-stone-500 dark:text-zinc-500">
            Recommendations are powered by AI and may take a few moments to generate
          </p>
        </div>
      </div>
    </div>
    
    <!-- Weather Recommendations Modal -->
    <div
      v-if="showWeatherRecommendationsModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      @click.self="showWeatherRecommendationsModal = false"
    >
      <div class="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        <!-- Header -->
        <div class="flex items-center justify-between p-6 border-b border-stone-200 dark:border-zinc-800">
          <div>
            <h2 class="text-2xl font-bold text-black dark:text-white flex items-center gap-2">
              <CloudSun class="w-6 h-6 text-blue-500" />
              Weather-Based Outfit Recommendations
            </h2>
            <p class="text-sm text-stone-600 dark:text-zinc-400 mt-1">
              <span v-if="weatherRecommendations.length > 0 && weatherRecommendations[0].weatherInfo">
                {{ weatherRecommendations[0].weatherInfo.location }}: {{ weatherRecommendations[0].weatherInfo.temperature }}°C, {{ weatherRecommendations[0].weatherInfo.description }}
              </span>
              <span v-else>Based on current weather conditions</span>
            </p>
          </div>
          <div class="flex items-center gap-2">
            <!-- ESC Key Hint (Desktop only) -->
            <div v-if="isDesktop" class="keyboard-hint-modal">
              <span class="keyboard-hint-key">ESC</span>
            </div>
            <button
              @click="showWeatherRecommendationsModal = false"
              class="p-2 rounded-lg transition-all bg-white/90 shadow-lg hover:bg-stone-100 text-stone-500 hover:text-black dark:bg-zinc-900/90 dark:hover:bg-zinc-800 dark:text-zinc-300 dark:hover:text-white"
              aria-label="Close dialog"
            >
              <X class="w-5 h-5" />
            </button>
          </div>
        </div>
        
        <!-- Content -->
        <div class="flex-1 overflow-y-auto p-6">
          <div v-if="weatherRecommendations.length === 0 && !generatingWeatherOutfit" class="text-center py-12">
            <CloudSun class="w-16 h-16 mx-auto mb-4 text-stone-300 dark:text-zinc-700" />
            <p class="text-stone-600 dark:text-zinc-400">No weather recommendations found</p>
          </div>
          
          <div v-else-if="generatingWeatherOutfit" class="text-center py-12">
            <div class="w-16 h-16 mx-auto mb-4 spinner-modern"></div>
            <p class="text-stone-600 dark:text-zinc-400">Fetching weather and analyzing your closet...</p>
          </div>
          
          <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div
              v-for="rec in weatherRecommendations"
              :key="rec.id"
              class="border border-stone-200 dark:border-zinc-800 rounded-xl p-4 hover:border-blue-300 dark:hover:border-blue-700 transition-colors bg-white dark:bg-zinc-900"
            >
              <!-- Score Badge -->
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                    #{{ rec.rank }}
                  </span>
                  <span class="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" title="Color Match">
                    🎨 {{ rec.colorScore }}%
                  </span>
                  <span class="text-xs px-2 py-1 rounded-full bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300" title="Weather Fit">
                    🌤️ {{ rec.weatherScore }}%
                  </span>
                </div>
                <span class="text-sm font-bold text-stone-700 dark:text-zinc-300">
                  {{ rec.totalScore }}%
                </span>
              </div>
              
              <!-- Items Grid -->
              <div class="grid grid-cols-2 gap-2 mb-3">
                <div
                  v-for="item in rec.items"
                  :key="item.id"
                  class="rounded-lg overflow-hidden bg-stone-100 dark:bg-zinc-800 flex flex-col"
                >
                  <div class="aspect-square relative overflow-hidden">
                    <ClothingImage
                      :src="item.image_url || item.thumbnail_url"
                      :alt="item.name"
                      class="w-full h-full object-cover"
                    />
                  </div>
                  <!-- Item Name and Category -->
                  <div class="p-2 bg-white dark:bg-zinc-900">
                    <p class="text-sm font-semibold mb-0.5 text-black dark:text-white truncate">
                      {{ item.name }}
                    </p>
                    <p class="text-xs text-stone-600 dark:text-zinc-400 truncate">
                      {{ item.category ? item.category.charAt(0).toUpperCase() + item.category.slice(1) : '' }}
                    </p>
                  </div>
                </div>
              </div>
              
              <!-- Load Button -->
              <button
                @click="loadWeatherRecommendation(rec)"
                class="w-full py-2 rounded-lg bg-black text-white hover:bg-zinc-800 transition-colors text-sm font-medium"
              >
                See on canvas
              </button>
            </div>
          </div>
        </div>
        
        <!-- Footer -->
        <div class="p-4 border-t border-stone-200 dark:border-zinc-800 text-center">
          <p class="text-xs text-stone-500 dark:text-zinc-500">
            Outfits ranked by color harmony, weather fit, and completeness
          </p>
        </div>
      </div>
    </div>
    
    <!-- Item Context Menu -->
    <div
      v-if="showItemContextMenuState && contextMenuItem"
      class="fixed z-[100] bg-white dark:bg-zinc-900 rounded-lg shadow-xl border border-stone-200 dark:border-zinc-800 py-2 min-w-[200px]"
      :style="{ left: `${contextMenuPosition.x}px`, top: `${contextMenuPosition.y}px` }"
      @click.stop
    >
      <button
        @click="generateWeatherOutfitsWithItem(contextMenuItem)"
        class="w-full px-4 py-2 text-left text-sm hover:bg-stone-100 dark:hover:bg-zinc-800 transition-colors flex items-center gap-2 text-black dark:text-white"
      >
        <CloudSun class="w-4 h-4 text-blue-500" />
        Generate Weather Outfits
      </button>
      <button
        @click="addItemToCanvas(contextMenuItem); closeContextMenu()"
        class="w-full px-4 py-2 text-left text-sm hover:bg-stone-100 dark:hover:bg-zinc-800 transition-colors flex items-center gap-2 text-black dark:text-white"
      >
        <Plus class="w-4 h-4" />
        Add to Canvas
      </button>
    </div>
  </div>
</template>

<script setup>
import ClothingImage from '@/components/ui/ClothingImage.vue'
import { ref, computed, onMounted, onUnmounted, watch, reactive, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTheme } from '@/composables/useTheme'
import { usePopup } from '@/composables/usePopup'
import { useAuthStore } from '@/stores/auth-store'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import { ClothesService } from '@/services/clothesService'
import { OutfitsService } from '@/services/outfitsService'
import { FriendsService } from '@/services/friendsService'
import { NotificationsService } from '@/services/notificationsService'
import { VirtualTryOnService } from '@/services/virtualTryOnService'
import { llamaDescriptionService } from '@/services/llamaDescriptionService'
import { generateRecommendations, getCategoryDisplayName } from '@/services/recommendation-service.js'
import { weatherService } from '@/services/weatherService'
import { getFirstName } from '@/utils'
import { getProxiedImageUrl } from '@/utils/imageProxy'
import { 
  Undo, 
  Redo, 
  Grid3X3, 
  Trash2, 
  Save, 
  Share2,
  User, 
  Eye,
  Shirt, 
  Sparkles,
  Plus,
  Users,
  X,
  CloudSun
} from 'lucide-vue-next'
import AddFriendDialog from '@/components/friends/AddFriendDialog.vue'
import ShareOutfitDialog from '@/components/dashboard/ShareOutfitDialog.vue'
import VirtualTryOnModal from '@/components/dashboard/VirtualTryOnModal.vue'

// Theme for grid display
const { theme } = useTheme()
const { showError, showSuccess, showWarning, showInfo, showPrompt } = usePopup()
const authStore = useAuthStore()
const route = useRoute()
const router = useRouter()

// Keyboard shortcuts
const { registerCanvasItems, registerPopup, unregisterPopup } = useKeyboardShortcuts()

// Initialize services
const clothesService = new ClothesService()
const outfitsService = new OutfitsService()
const friendsService = new FriendsService()
const notificationsService = new NotificationsService()
const virtualTryOnService = new VirtualTryOnService()

// Use computed to get reactive user data from auth store
const currentUser = computed(() => authStore.user || authStore.profile)

// Sub-route detection
const currentSubRoute = computed(() => {
  // If on friend route without username parameter, show friend selection
  if (route.meta.subRoute === 'friend' && !route.params.username) {
    return 'friendSelect'
  }
  return route.meta.subRoute || 'default'
})

const subRouteTitle = computed(() => {
  switch (currentSubRoute.value) {
    case 'suggested': return 'Create Your Outfit'
    case 'personal': return 'Create Your Outfit'
    case 'friendSelect': return 'Select a Friend'
    case 'friend': return friendProfile.value ? `Create Outfit for ${getFirstName(friendProfile.value.name) || (friendProfile.value.username ? `@${friendProfile.value.username}` : 'Friend')}` : `Create with Friend's Items`
    case 'edit': return 'Edit Outfit'
    default: return 'Create Outfit'
  }
})

// State - Initialize itemsSource based on route
const itemsSource = ref('my-cabinet')
const activeCategory = ref('all')
const wardrobeItems = ref([])
const loadingWardrobeItems = ref(false)
const canvasItems = ref([])
const selectedItemId = ref(null)
const showGrid = ref(false)
const tooltipItemId = ref(null)
const tooltipPosition = ref({ x: 0, y: 0 })
const tooltipTimeout = ref(null)
const savingOutfit = ref(false)
const scoringOutfit = ref(false)
const outfitScore = ref(null)
const canvasContainer = ref(null)

// Reference canvas dimensions (desktop default)
// These are used to normalize positions across different screen sizes
const REFERENCE_CANVAS_WIDTH = 800
const REFERENCE_CANVAS_HEIGHT = 600

// Computed scale factors for responsive positioning
const canvasScale = computed(() => {
  if (!canvasContainer.value) return { x: 1, y: 1 }
  const rect = canvasContainer.value.getBoundingClientRect()
  return {
    x: rect.width / REFERENCE_CANVAS_WIDTH,
    y: rect.height / REFERENCE_CANVAS_HEIGHT
  }
})

// Scale position from reference size to current canvas size
const scalePosition = (position, axis = 'x') => {
  const scale = canvasScale.value[axis]
  return position * scale
}

// Normalize position from current canvas size to reference size
const normalizePosition = (position, axis = 'x') => {
  const scale = canvasScale.value[axis]
  return scale > 0 ? position / scale : position
}

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
const findNonOverlappingPosition = (existingItems, itemSize, startX, startY) => {
  const maxAttempts = 50
  let currentScale = 1.0
  let minScale = 0.3 // Minimum scale to try
  
  // Define button area exclusion zone (top 80px to prevent overlap with centered buttons)
  const BUTTON_AREA_HEIGHT = 80
  const normalizedButtonArea = normalizePosition(BUTTON_AREA_HEIGHT, 'y')
  
  // Ensure startY is below button area if it's too high
  const safeStartY = Math.max(startY, normalizedButtonArea + (itemSize / 2))
  const safeStartX = startX // Use startX directly (already safe)
  
  // Try different scales, starting from full size
  while (currentScale >= minScale) {
    const scaledSize = itemSize * currentScale
    
    // Try positions in a spiral pattern from the drop point
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const angleIndex = attempt % 8 // 8 directions (0-7)
      const circleIndex = Math.floor(attempt / 8) // Which circle (0, 1, 2, ...)
      const angle = (angleIndex * 45) * (Math.PI / 180) // Convert to radians
      const radius = (circleIndex + 1) * (scaledSize * 0.6) // Increase radius each circle
      
      const x = safeStartX + radius * Math.cos(angle) - (scaledSize / 2)
      const y = safeStartY + radius * Math.sin(angle) - (scaledSize / 2)
      
      // Check bounds (normalized to reference canvas) and ensure item is below button area
      if (x < 0 || y < normalizedButtonArea || x + scaledSize > REFERENCE_CANVAS_WIDTH || y + scaledSize > REFERENCE_CANVAS_HEIGHT) {
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
        // Existing items have their size already in reference coordinates
        // itemSize here is the normalized item size (same for all items)
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
  
  // If still no position found, place below button area with minimum scale
  return {
    x: (REFERENCE_CANVAS_WIDTH / 2) - (itemSize * minScale / 2),
    y: Math.max(normalizedButtonArea + 10, (REFERENCE_CANVAS_HEIGHT / 2) - (itemSize * minScale / 2)),
    scale: minScale
  }
}

// State for recommendations
const recommendingOutfits = ref(false)
const generatingWeatherOutfit = ref(false)
const showRecommendationsModal = ref(false)
const recommendations = ref([])
const selectedRecommendation = ref(null)

// Weather recommendations state
const showWeatherRecommendationsModal = ref(false)
const weatherRecommendations = ref([])
const selectedWardrobeItemForWeather = ref(null)

// Desktop detection for ESC hint
const isDesktop = ref(false)
const handleResize = () => {
  isDesktop.value = window.innerWidth >= 1024
}

// Context menu state
const showItemContextMenuState = ref(false)
const contextMenuPosition = reactive({ x: 0, y: 0 })
const contextMenuItem = ref(null)

// State for friend data
const friendProfile = ref(null)
const friendUsername = computed(() => route.params.username)
const friendsList = ref([]) // List of friends for selection
const loadingFriends = ref(false) // Loading state for friends list
const loadingFriendProfile = ref(false) // Loading state for friend profile
const showAddFriendModal = ref(false) // Modal state for adding friends
const showShareOutfitDialog = ref(false) // Modal state for sharing outfit with friend

// State for edit mode
const currentOutfitId = ref(null)
const currentOutfitName = ref(null)

// State for virtual try-on
const showVirtualTryOnModal = ref(false)
const generatingTryOn = ref(false)
const virtualTryOnImageUrl = ref(null)
const virtualTryOnError = ref(null)
const virtualTryOnItemIds = ref(null) // Track which items were used for generation

// Set itemsSource based on current sub-route
const initializeItemsSource = () => {
  if (currentSubRoute.value === 'personal' || currentSubRoute.value === 'edit') {
    itemsSource.value = 'my-cabinet'
  } else if (currentSubRoute.value === 'friend') {
    itemsSource.value = 'friends'
  } else if (currentSubRoute.value === 'suggested') {
    // For AI suggestions, still show user's items so they can add more
    itemsSource.value = 'my-cabinet'
  } else {
    itemsSource.value = 'my-cabinet' // Default
  }
  console.log('OutfitCreator: Initialized items source to:', itemsSource.value, 'for route:', currentSubRoute.value)
}

// History for undo/redo
const history = ref([[]])
const historyIndex = ref(0)

// Categories
const categories = ['all', 'tops', 'bottoms', 'shoes', 'accessories', 'outerwear']

// Computed
const filteredItems = computed(() => {
  let filtered = wardrobeItems.value
  console.log('OutfitCreator: Filtering items. Total items:', wardrobeItems.value.length, 'Category:', activeCategory.value, 'Source:', itemsSource.value)
  
  // Filter by category (case-insensitive comparison)
  if (activeCategory.value !== 'all') {
    filtered = filtered.filter(item => {
      const itemCategory = (item.category || '').toLowerCase()
      const filterCategory = activeCategory.value.toLowerCase()
      return itemCategory === filterCategory
    })
  }
  
  // Filter by source (items are already loaded based on source in loadWardrobeItems)
  if (itemsSource.value === 'my-cabinet') {
    console.log('OutfitCreator: Showing user\'s closet items')
  } else if (itemsSource.value === 'friends') {
    console.log('OutfitCreator: Showing friend\'s items')
  } else if (itemsSource.value === 'suggestions') {
    console.log('OutfitCreator: Showing AI suggestions')
  }
  
  console.log('OutfitCreator: Filtered items:', filtered.length)
  return filtered
})

const canUndo = computed(() => historyIndex.value > 0)
const canRedo = computed(() => historyIndex.value < history.value.length - 1)

const selectedItem = computed(() => {
  return canvasItems.value.find(item => item.id === selectedItemId.value)
})

const itemsSectionTitle = computed(() => {
  if (currentSubRoute.value === 'friend' && friendProfile.value) {
    return `${getFirstName(friendProfile.value.name) || (friendProfile.value.username ? `@${friendProfile.value.username}` : 'Friend')}'s Closet`
  }
  switch (itemsSource.value) {
    case 'my-cabinet': return 'My Closet'
    case 'friends': return "Friend's Closet"
    case 'suggestions': return 'AI Suggestions'
    default: return 'Items'
  }
})

const saveButtonLabel = computed(() => {
  if (currentSubRoute.value === 'friend') {
    return 'Share'
  }
  if (currentSubRoute.value === 'edit' && currentOutfitId.value) {
    return 'Update'
  }
  return 'Save'
})

// Computed property to check if virtual try-on can be shown
// Requires at least one top and one bottom on the canvas
const canShowVirtualTryOn = computed(() => {
  const hasTop = canvasItems.value.some(item => {
    const category = item.category?.toLowerCase()
    return category === 'tops' || category === 'top' || category === 't-shirt' || 
           category === 'shirt' || category === 'blouse' || category === 'hoodie' || 
           category === 'longsleeve' || category === 'polo' || category === 'body' || 
           category === 'undershirt' || category === 'outerwear' || category === 'blazer'
  })
  
  const hasBottom = canvasItems.value.some(item => {
    const category = item.category?.toLowerCase()
    return category === 'bottoms' || category === 'bottom' || category === 'pants' || 
           category === 'shorts' || category === 'skirt'
  })
  
  return hasTop && hasBottom
})

// Check if current canvas items match the items used for virtual try-on generation
const virtualTryOnMatchesCanvas = computed(() => {
  if (!virtualTryOnImageUrl.value || !virtualTryOnItemIds.value) {
    return false
  }
  
  // Get current top and bottom item IDs
  const topItem = canvasItems.value.find(item => {
    const category = item.category?.toLowerCase()
    return category === 'tops' || category === 'top' || category === 't-shirt' || 
           category === 'shirt' || category === 'blouse' || category === 'hoodie' || 
           category === 'longsleeve' || category === 'polo' || category === 'body' || 
           category === 'undershirt' || category === 'outerwear' || category === 'blazer'
  })
  
  const bottomItem = canvasItems.value.find(item => {
    const category = item.category?.toLowerCase()
    return category === 'bottoms' || category === 'bottom' || category === 'pants' || 
           category === 'shorts' || category === 'skirt'
  })
  
  if (!topItem || !bottomItem) {
    return false
  }
  
  // Compare using originalId (the actual clothing item ID, not canvas ID)
  const currentTopId = topItem.originalId || topItem.id
  const currentBottomId = bottomItem.originalId || bottomItem.id
  
  return virtualTryOnItemIds.value.topId === currentTopId && 
         virtualTryOnItemIds.value.bottomId === currentBottomId
})

// Watch for changes in items source and reload items
watch(itemsSource, async (newSource, oldSource) => {
  if (newSource !== oldSource) {
    console.log('OutfitCreator: Items source changed from', oldSource, 'to', newSource)
    await loadWardrobeItems()
  }
})

// Watch for canvas items changes - clear virtual try-on if items don't match
watch(() => canvasItems.value.map(item => ({
  id: item.originalId || item.id,
  category: item.category?.toLowerCase()
})), (newItems, oldItems) => {
  // Only check if we have a generated image
  if (virtualTryOnImageUrl.value && virtualTryOnItemIds.value) {
    // If items array changed length (add/remove), clear try-on
    if (oldItems && newItems.length !== oldItems.length) {
      console.log('🎨 OutfitCreator: Canvas items count changed, clearing virtual try-on')
      virtualTryOnImageUrl.value = null
      virtualTryOnItemIds.value = null
      return
    }
    
    // Check if top or bottom items changed
    const newTop = newItems.find(item => {
      const cat = item.category
      return cat === 'tops' || cat === 'top' || cat === 't-shirt' || 
             cat === 'shirt' || cat === 'blouse' || cat === 'hoodie' || 
             cat === 'longsleeve' || cat === 'polo' || cat === 'body' || 
             cat === 'undershirt' || cat === 'outerwear' || cat === 'blazer'
    })
    const newBottom = newItems.find(item => {
      const cat = item.category
      return cat === 'bottoms' || cat === 'bottom' || cat === 'pants' || 
             cat === 'shorts' || cat === 'skirt'
    })
    
    // If top or bottom changed and doesn't match stored IDs, clear try-on
    if (newTop && newTop.id !== virtualTryOnItemIds.value.topId ||
        newBottom && newBottom.id !== virtualTryOnItemIds.value.bottomId) {
      console.log('🎨 OutfitCreator: Canvas items changed, clearing virtual try-on')
      virtualTryOnImageUrl.value = null
      virtualTryOnItemIds.value = null
    }
  }
}, { deep: true })

// Methods
const loadFriendProfile = async (username) => {
  try {
    loadingFriendProfile.value = true
    console.log('OutfitCreator: Loading friend profile:', username)
    const friend = await friendsService.getFriendByUsername(username)
    
    if (friend) {
      friendProfile.value = friend
      console.log('OutfitCreator: Loaded friend profile:', friend)
    } else {
      console.error('OutfitCreator: Friend not found')
      friendProfile.value = null
    }
  } catch (error) {
    console.error('OutfitCreator: Error loading friend profile:', error)
    friendProfile.value = null
  } finally {
    loadingFriendProfile.value = false
  }
}

const loadFriendsList = async () => {
  try {
    console.log('OutfitCreator: Loading friends list...')
    loadingFriends.value = true
    
    if (!currentUser.value?.id) {
      console.log('OutfitCreator: No user ID, cannot load friends')
      friendsList.value = []
      loadingFriends.value = false
      return
    }
    
    const friends = await friendsService.getFriends()
    
    if (friends) {
      friendsList.value = friends
      console.log('OutfitCreator: Loaded friends list:', friendsList.value.length, 'friends')
    } else {
      console.error('OutfitCreator: Failed to load friends')
      friendsList.value = []
    }
  } catch (error) {
    console.error('OutfitCreator: Error loading friends list:', error)
    friendsList.value = []
  } finally {
    loadingFriends.value = false
  }
}

const selectFriend = (friend) => {
  console.log('OutfitCreator: Friend selected:', friend.username)
  // Navigate to the friend's outfit creator page
  router.push(`/outfits/add/friend/${friend.username}`)
}

// Watch AddFriendDialog close/friendRequestSent to redirect
const addFriendDialogOpen = ref(false)

const handleFriendRequestSent = () => {
  addFriendDialogOpen.value = false
  router.push('/friends/requests/sent')
}

watch(addFriendDialogOpen, (open, prev) => {
  if (prev && !open) {
    // Closed dialog, manually navigate
    router.push('/friends/requests/sent')
  }
})

const loadWardrobeItems = async () => {
  try {
    loadingWardrobeItems.value = true
    console.log('OutfitCreator: Loading wardrobe items...')
    console.log('OutfitCreator: Current user:', currentUser.value)
    console.log('OutfitCreator: Items source:', itemsSource.value)
    console.log('OutfitCreator: Current route:', currentSubRoute.value)
    
    if (!currentUser.value?.id) {
      console.log('OutfitCreator: No user ID, cannot load items')
      wardrobeItems.value = []
      return
    }
    
    // Load items based on source
    if (itemsSource.value === 'my-cabinet') {
      // Load items from user's closet using ClothesService
      const result = await clothesService.getClothes({
        owner_id: currentUser.value.id,
        limit: 100 // Load up to 100 items
      })
      
      if (result && result.success) {
        wardrobeItems.value = result.data || []
        console.log('OutfitCreator: Loaded items from user closet:', wardrobeItems.value.length, 'items')
      } else {
        console.error('OutfitCreator: Failed to load items:', result?.error || 'Unknown error')
        wardrobeItems.value = []
      }
    } else if (itemsSource.value === 'friends') {
      // Load items from friend's closet using privacy-respecting method
      if (!friendProfile.value?.id) {
        console.log('OutfitCreator: No friend profile loaded, cannot load items')
        wardrobeItems.value = []
        return
      }
      
      console.log('OutfitCreator: Loading friend items for:', friendProfile.value.username)
      const result = await clothesService.getFriendCloset(friendProfile.value.id)
      
      if (result && result.success) {
        wardrobeItems.value = result.data || []
        console.log('OutfitCreator: Loaded items from friend closet:', wardrobeItems.value.length, 'items')
      } else {
        console.error('OutfitCreator: Failed to load friend items:', result?.error || 'Unknown error')
        wardrobeItems.value = []
      }
    } else if (itemsSource.value === 'suggestions') {
      // AI suggestions - not implemented yet
      console.log('OutfitCreator: AI suggestions not yet implemented')
      wardrobeItems.value = []
    }
    
  } catch (error) {
    console.error('OutfitCreator: Error loading wardrobe items:', error)
    wardrobeItems.value = []
  } finally {
    loadingWardrobeItems.value = false
  }
}

const loadExistingOutfit = async (outfitId) => {
  try {
    console.log('OutfitCreator: Loading existing outfit:', outfitId)
    
    const outfit = await outfitsService.getOutfit(outfitId)
    
    if (!outfit) {
      console.error('OutfitCreator: Outfit not found')
      showError('Outfit not found.')
      router.push('/outfits')
      return
    }
    
    console.log('OutfitCreator: Loaded outfit:', outfit)
    
    // Store outfit ID and name for editing
    currentOutfitId.value = outfit.id
    currentOutfitName.value = outfit.outfit_name || outfit.name || 'Untitled Outfit'
    
    // Load outfit items onto the canvas
    // Handle positions: if positions are > reference size, they were saved for a larger canvas
    // Normalize them to reference size for consistent scaling
    if (outfit.outfit_items && outfit.outfit_items.length > 0) {
      // Wait for canvas container to be available to check actual bounds
      await nextTick()
      
      canvasItems.value = outfit.outfit_items.map((outfitItem, index) => {
        let x = outfitItem.x_position || 100
        let y = outfitItem.y_position || 100
        const itemScale = outfitItem.scale || 1
        const itemSize = 128 * itemScale // Item size in reference coordinates
        
        // If positions are larger than reference canvas, they were likely saved on a larger screen
        // Normalize them to reference size (assume they were saved on a canvas ~800px wide)
        // This is a heuristic - positions > 1000px are probably from a larger desktop canvas
        if (x > REFERENCE_CANVAS_WIDTH * 1.2 || y > REFERENCE_CANVAS_HEIGHT * 1.2) {
          // Assume they were saved on a canvas approximately this size, normalize proportionally
          const assumedWidth = Math.max(x * 1.5, REFERENCE_CANVAS_WIDTH)
          const assumedHeight = Math.max(y * 1.5, REFERENCE_CANVAS_HEIGHT)
          x = (x / assumedWidth) * REFERENCE_CANVAS_WIDTH
          y = (y / assumedHeight) * REFERENCE_CANVAS_HEIGHT
        }
        
        // Ensure items are within reference canvas bounds
        x = Math.max(0, Math.min(x, REFERENCE_CANVAS_WIDTH - itemSize))
        y = Math.max(0, Math.min(y, REFERENCE_CANVAS_HEIGHT - itemSize))
        
        // Check if item would be visible on current canvas size
        // If canvas container is available, verify actual visibility
        if (canvasContainer.value) {
          const rect = canvasContainer.value.getBoundingClientRect()
          const currentScaleX = rect.width / REFERENCE_CANVAS_WIDTH
          const currentScaleY = rect.height / REFERENCE_CANVAS_HEIGHT
          
          // Calculate where item would actually render
          const renderedX = x * currentScaleX
          const renderedY = y * currentScaleY
          const renderedSize = itemSize * Math.min(currentScaleX, currentScaleY)
          
          // If item would be off-screen, adjust to be visible
          // Center items if they're too spread out for the smaller canvas
          if (renderedX + renderedSize > rect.width || renderedY + renderedSize > rect.height) {
            // Calculate a safe position that keeps items visible
            // For mobile, we might want to compact items more
            const maxX = normalizePosition(rect.width - renderedSize, 'x')
            const maxY = normalizePosition(rect.height - renderedSize, 'y')
            
            // Clamp to visible bounds
            x = Math.max(0, Math.min(x, maxX))
            y = Math.max(0, Math.min(y, maxY))
            
            console.log(`OutfitCreator: Adjusted item ${index + 1} position for mobile view (${rect.width}x${rect.height})`)
          }
        }
        
        return {
          ...outfitItem.clothing_item,
          originalId: outfitItem.clothing_item.id, // Store original ID
          id: `canvas-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`, // Unique canvas ID (not UUID)
          x: x,
          y: y,
          scale: itemScale,
          rotation: outfitItem.rotation || 0,
          z_index: outfitItem.z_index || 0
        }
      })
      
      saveToHistory()
      console.log('OutfitCreator: Loaded', canvasItems.value.length, 'items onto canvas')
    }
    
  } catch (error) {
    console.error('OutfitCreator: Error loading outfit:', error)
    showError('Failed to load outfit. Please try again.')
    router.push('/outfits')
  }
}

const generateAISuggestion = async () => {
  try {
    console.log('OutfitCreator: Generating AI suggestion...')
    
    if (wardrobeItems.value.length === 0) {
      console.log('OutfitCreator: No items available for AI suggestion')
      return
    }
    
    // Import fashion transformer service
    const { scoreOutfit, validateOutfitItems } = await import('@/services/fashion-transformer-service')
    
    const categories = {
      top: wardrobeItems.value.filter(item => {
        const cat = item.category?.toLowerCase()
        return cat === 'top' || cat === 't-shirt' || cat === 'shirt' || cat === 'blouse' || cat === 'hoodie' || cat === 'longsleeve' || cat === 'polo' || cat === 'body' || cat === 'undershirt'
      }),
      bottom: wardrobeItems.value.filter(item => {
        const cat = item.category?.toLowerCase()
        return cat === 'bottom' || cat === 'pants' || cat === 'shorts' || cat === 'skirt'
      }),
      shoes: wardrobeItems.value.filter(item => {
        const cat = item.category?.toLowerCase()
        return cat === 'shoes' || cat === 'slippers'
      }),
      hat: wardrobeItems.value.filter(item => item.category?.toLowerCase() === 'hat'),
      outerwear: wardrobeItems.value.filter(item => {
        const cat = item.category?.toLowerCase()
        return cat === 'outerwear' || cat === 'blazer'
      })
    }
    
    const selectedItems = []
    
    // Try to pick one item from each category (smart outfit composition)
    if (categories.top.length > 0) {
      const randomTop = categories.top[Math.floor(Math.random() * categories.top.length)]
      selectedItems.push({ item: randomTop, y: 100 })
    }
    
    if (categories.bottom.length > 0) {
      const randomBottom = categories.bottom[Math.floor(Math.random() * categories.bottom.length)]
      selectedItems.push({ item: randomBottom, y: 250 })
    }
    
    if (categories.shoes.length > 0) {
      const randomShoes = categories.shoes[Math.floor(Math.random() * categories.shoes.length)]
      selectedItems.push({ item: randomShoes, y: 400 })
    }
    
    // Optionally add accessories or outerwear (50% chance)
    if (categories.hat.length > 0 && Math.random() > 0.5) {
      const randomAccessory = categories.hat[Math.floor(Math.random() * categories.hat.length)]
      selectedItems.push({ item: randomAccessory, y: 150 })
    }
    
    if (categories.outerwear.length > 0 && Math.random() > 0.5) {
      const randomOuterwear = categories.outerwear[Math.floor(Math.random() * categories.outerwear.length)]
      selectedItems.push({ item: randomOuterwear, y: 80 })
    }
    
    // Validate: Ensure we have at least one top and one bottom
    const hasTop = selectedItems.some(selected => {
      const category = selected.item.category?.toLowerCase()
      return category === 'top' || category === 't-shirt' || category === 'shirt' || 
             category === 'blouse' || category === 'hoodie' || category === 'longsleeve' || 
             category === 'polo' || category === 'body' || category === 'undershirt' ||
             category === 'outerwear' || category === 'blazer'
    })
    
    const hasBottom = selectedItems.some(selected => {
      const category = selected.item.category?.toLowerCase()
      return category === 'bottom' || category === 'pants' || category === 'shorts' || category === 'skirt'
    })
    
    if (!hasTop || !hasBottom) {
      console.log('OutfitCreator: Cannot generate valid outfit - missing required categories')
      showWarning('Unable to generate outfit. You need at least one top and one bottom in your closet.')
      return
    }
    
    // Place selected items on canvas with non-overlapping placement
    canvasItems.value = []
    const normalizedItemSize = normalizePosition(128, 'x') // 128px item size normalized
    const BUTTON_AREA_HEIGHT = 80
    const normalizedButtonArea = normalizePosition(BUTTON_AREA_HEIGHT, 'y')
    let currentX = 150
    let currentY = Math.max(100, normalizedButtonArea + 50) // Ensure below button area
    
    selectedItems.forEach((selected, index) => {
      // Find non-overlapping position for this item
      const position = findNonOverlappingPosition(
        canvasItems.value, // Existing items on canvas
        normalizedItemSize,
        currentX,
        currentY || selected.y // Use selected.y as starting point if provided
      )
      
      // Update current position for next item (spiral pattern)
      currentX = position.x + normalizedItemSize * position.scale + 20
      currentY = position.y + normalizedItemSize * position.scale + 20
      
      const newItem = {
        ...selected.item,
        originalId: selected.item.id, // Store original clothing item ID
        id: `canvas-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`, // Unique canvas ID (not UUID)
        x: position.x,
        y: position.y,
        scale: position.scale,
        rotation: 0,
        z_index: index + 1
      }
      
      canvasItems.value.push(newItem) // Add to canvas so next item can check for overlap
    })
    
    saveToHistory()
    console.log('OutfitCreator: AI placed', canvasItems.value.length, 'items on canvas')
    
  } catch (error) {
    console.error('OutfitCreator: Error generating AI suggestion:', error)
  }
}

// ============================================
// Weather-Based Outfit Generation
// ============================================

/**
 * Generate weather-based outfit recommendations
 * Filters clothing by weather conditions and applies color theory matching
 * Generates multiple outfits and ranks them
 */
const generateWeatherBasedOutfit = async (fixedItem = null) => {
  try {
    console.log('OutfitCreator: Generating weather-based outfit recommendations...')
    
    if (wardrobeItems.value.length < 2) {
      showWarning('You need at least 2 items in your closet for weather recommendations')
      return
    }
    
    generatingWeatherOutfit.value = true
    showWeatherRecommendationsModal.value = true
    
    // Fetch current weather (default to Singapore, could prompt user for location in future)
    const location = 'Singapore'
    let weatherData = null
    
    try {
      weatherData = await weatherService.getCurrentWeather(location)
      console.log('OutfitCreator: Weather data received:', weatherData)
    } catch (error) {
      console.warn('OutfitCreator: Weather API unavailable, using default weather conditions')
      // Fallback to moderate weather if API is unavailable
      weatherData = {
        temperature: 25,
        condition: 'clear',
        location: location
      }
    }
    
    const { temperature, condition } = weatherData
    
    // Filter items based on weather conditions
    let weatherFilteredItems = filterItemsByWeather(wardrobeItems.value, { temperature, condition })
    
    // Debug logging: Show what items remain after filtering
    console.log('OutfitCreator: After weather filtering:', {
      totalItems: wardrobeItems.value.length,
      filteredItems: weatherFilteredItems.length,
      categories: weatherFilteredItems.reduce((acc, item) => {
        const cat = item.category?.toLowerCase() || 'unknown'
        acc[cat] = (acc[cat] || 0) + 1
        return acc
      }, {})
    })
    
    // If a fixed item is provided, ensure it's included and available
    if (fixedItem) {
      const fixedItemInList = weatherFilteredItems.find(item => item.id === fixedItem.id)
      if (!fixedItemInList) {
        // If fixed item doesn't pass weather filter, add it anyway (user wants it)
        weatherFilteredItems = [fixedItem, ...weatherFilteredItems]
      }
    }
    
    if (weatherFilteredItems.length < 2) {
      showWarning('Not enough weather-appropriate items in your closet for current conditions')
      generatingWeatherOutfit.value = false
      showWeatherRecommendationsModal.value = false
      return
    }
    
    // Generate multiple outfit combinations
    const outfitCombinations = generateWeatherOutfitCombinations(
      weatherFilteredItems,
      { temperature, condition },
      fixedItem
    )
    
    // Debug logging: Show what categories were found
    const categories = {
      top: weatherFilteredItems.filter(item => {
        const cat = item.category?.toLowerCase()
        return cat === 'top' || cat === 't-shirt' || cat === 'shirt' || cat === 'blouse' || 
               cat === 'hoodie' || cat === 'longsleeve' || cat === 'polo' || cat === 'body' || 
               cat === 'undershirt'
      }),
      bottom: weatherFilteredItems.filter(item => {
        const cat = item.category?.toLowerCase()
        return cat === 'bottom' || cat === 'pants' || cat === 'shorts' || cat === 'skirt'
      }),
      shoes: weatherFilteredItems.filter(item => {
        const cat = item.category?.toLowerCase()
        return cat === 'shoes' || cat === 'slippers'
      })
    }
    
    console.log('OutfitCreator: Category breakdown:', {
      tops: categories.top.length,
      bottoms: categories.bottom.length,
      shoes: categories.shoes.length,
      topItems: categories.top.map(i => ({ name: i.name, category: i.category })),
      bottomItems: categories.bottom.map(i => ({ name: i.name, category: i.category }))
    })
    
    if (outfitCombinations.length === 0) {
      // Provide more specific error message
      let errorMsg = 'Unable to generate weather-appropriate outfits. '
      if (categories.top.length === 0) {
        errorMsg += 'No tops found in your closet. '
      }
      if (categories.bottom.length === 0) {
        errorMsg += 'No bottoms found in your closet. '
      }
      if (categories.top.length === 0 && categories.bottom.length === 0) {
        errorMsg += 'You need at least one top and one bottom item.'
      } else if (categories.top.length > 0 && categories.bottom.length > 0) {
        errorMsg += 'Items may not match the current weather conditions (' + temperature + '°C). Try adding more items to your closet.'
      }
      showWarning(errorMsg)
      generatingWeatherOutfit.value = false
      showWeatherRecommendationsModal.value = false
      return
    }
    
    // Score and rank each outfit
    const scoredOutfits = outfitCombinations.map((outfit, index) => {
      const colorScore = calculateOutfitColorScore(outfit.items)
      const weatherScore = calculateWeatherFitScore(outfit.items, { temperature, condition })
      const completenessScore = calculateCompletenessScore(outfit.items)
      
      // Weighted total score: 40% color, 40% weather fit, 20% completeness
      const totalScore = (colorScore * 0.4) + (weatherScore * 0.4) + (completenessScore * 0.2)
      
      // Debug logging
      if (index < 3) {
        console.log(`Outfit ${index + 1} colors:`, outfit.items.map(i => ({ 
          name: i.name, 
          color: i.primary_color || i.color || 'none',
          category: i.category 
        })))
        console.log(`Outfit ${index + 1} scores:`, {
          color: Math.round(colorScore * 100) + '%',
          weather: Math.round(weatherScore * 100) + '%',
          completeness: Math.round(completenessScore * 100) + '%',
          total: Math.round(totalScore * 100) + '%'
        })
      }
      
      return {
        ...outfit,
        colorScore: Math.round(colorScore * 100),
        weatherScore: Math.round(weatherScore * 100),
        completenessScore: Math.round(completenessScore * 100),
        totalScore: Math.round(totalScore * 100)
      }
    })
    
    // Sort by total score (highest first)
    scoredOutfits.sort((a, b) => b.totalScore - a.totalScore)
    
    // Add rank and format for display
    weatherRecommendations.value = scoredOutfits.map((outfit, index) => ({
      id: `weather-${Date.now()}-${index}`,
      items: outfit.items,
      colorScore: outfit.colorScore,
      weatherScore: outfit.weatherScore,
      completenessScore: outfit.completenessScore,
      totalScore: outfit.totalScore,
      rank: index + 1,
      weatherInfo: weatherData
    }))
    
    generatingWeatherOutfit.value = false
    console.log(`OutfitCreator: Generated ${weatherRecommendations.value.length} weather-based outfit recommendations`)
    
  } catch (error) {
    console.error('OutfitCreator: Error generating weather-based outfits:', error)
    showError('Failed to generate weather-based outfit recommendations. Please try again.')
    generatingWeatherOutfit.value = false
    showWeatherRecommendationsModal.value = false
  }
}

/**
 * Generate multiple outfit combinations based on weather
 */
function generateWeatherOutfitCombinations(items, weather, fixedItem = null) {
  const { temperature, condition } = weather
  const combinations = []
  const maxCombinations = 20 // Generate up to 20 combinations
  
  // Categorize items
  const categories = {
    top: items.filter(item => {
      if (fixedItem && item.id === fixedItem.id && isTopCategory(fixedItem)) return true
      const cat = item.category?.toLowerCase()
      return cat === 'top' || cat === 't-shirt' || cat === 'shirt' || cat === 'blouse' || 
             cat === 'hoodie' || cat === 'longsleeve' || cat === 'polo' || cat === 'body' || 
             cat === 'undershirt'
    }),
    bottom: items.filter(item => {
      if (fixedItem && item.id === fixedItem.id && isBottomCategory(fixedItem)) return true
      const cat = item.category?.toLowerCase()
      return cat === 'bottom' || cat === 'pants' || cat === 'shorts' || cat === 'skirt'
    }),
    shoes: items.filter(item => {
      if (fixedItem && item.id === fixedItem.id) {
        const fixedCat = fixedItem.category?.toLowerCase()
        if (fixedCat === 'shoes' || fixedCat === 'slippers') return true
      }
      const cat = item.category?.toLowerCase()
      return cat === 'shoes' || cat === 'slippers'
    }),
    outerwear: items.filter(item => {
      if (fixedItem && item.id === fixedItem.id && (item.category?.toLowerCase() === 'outerwear' || item.category?.toLowerCase() === 'blazer')) return true
      const cat = item.category?.toLowerCase()
      return cat === 'outerwear' || cat === 'blazer'
    }),
    accessory: items.filter(item => {
      if (fixedItem && item.id === fixedItem.id && (item.category?.toLowerCase() === 'hat' || item.category?.toLowerCase() === 'accessory')) return true
      const cat = item.category?.toLowerCase()
      return cat === 'hat' || cat === 'accessory'
    })
  }
  
  // Determine which category the fixed item belongs to
  let fixedCategory = null
  if (fixedItem) {
    if (isTopCategory(fixedItem)) fixedCategory = 'top'
    else if (isBottomCategory(fixedItem)) fixedCategory = 'bottom'
      else if (fixedItem.category?.toLowerCase() === 'shoes' || fixedItem.category?.toLowerCase() === 'slippers') {
        fixedCategory = 'shoes'
      }
    else if (fixedItem.category?.toLowerCase() === 'outerwear' || fixedItem.category?.toLowerCase() === 'blazer') fixedCategory = 'outerwear'
    else if (fixedItem.category?.toLowerCase() === 'hat' || fixedItem.category?.toLowerCase() === 'accessory') fixedCategory = 'accessory'
  }
  
  // Generate combinations
  const tops = fixedCategory === 'top' ? [fixedItem] : categories.top
  const bottoms = fixedCategory === 'bottom' ? [fixedItem] : categories.bottom
  const shoesList = fixedCategory === 'shoes' ? [fixedItem] : categories.shoes
  const outerwearList = fixedCategory === 'outerwear' ? [fixedItem] : categories.outerwear
  const accessoriesList = fixedCategory === 'accessory' ? [fixedItem] : categories.accessory
  
  // Generate base combinations (top + bottom)
  for (const top of tops.slice(0, 5)) { // Limit tops to avoid too many combinations
    for (const bottom of bottoms.slice(0, 5)) {
      if (combinations.length >= maxCombinations) break
      
      const outfitItems = [top, bottom]
      
      // Add shoes (try to match color)
      if (shoesList.length > 0) {
        const matchedShoes = selectItemWithColorMatching(shoesList, outfitItems)
        if (matchedShoes) outfitItems.push(matchedShoes)
      }
      
      // Conditionally add outerwear
      if ((temperature < 15 || condition === 'rain') && outerwearList.length > 0) {
        const matchedOuterwear = selectItemWithColorMatching(outerwearList, outfitItems)
        if (matchedOuterwear) outfitItems.push(matchedOuterwear)
      }
      
      // Conditionally add accessory
      if (temperature < 5 && accessoriesList.length > 0 && Math.random() > 0.7) {
        const matchedAccessory = selectItemWithColorMatching(accessoriesList, outfitItems)
        if (matchedAccessory) outfitItems.push(matchedAccessory)
      }
      
      combinations.push({ items: outfitItems })
    }
  }
  
  return combinations
}

function isTopCategory(item) {
  const cat = item.category?.toLowerCase()
  return cat === 'top' || cat === 't-shirt' || cat === 'shirt' || cat === 'blouse' || 
         cat === 'hoodie' || cat === 'longsleeve' || cat === 'polo' || cat === 'body' || 
         cat === 'undershirt' || cat === 'outerwear' || cat === 'blazer'
}

function isBottomCategory(item) {
  const cat = item.category?.toLowerCase()
  return cat === 'bottom' || cat === 'pants' || cat === 'shorts' || cat === 'skirt'
}

/**
 * Calculate color harmony score for an outfit (0-1)
 * More nuanced scoring based on actual color combinations with penalties for clashing colors
 */
function calculateOutfitColorScore(items) {
  if (items.length < 2) return 0.5
  
  const NEUTRAL = ['black', 'white', 'gray', 'grey', 'beige', 'navy', 'tan', 'ivory', 'cream', 'charcoal']
  const NEUTRAL_BLUE = ['blue', 'navy'] // Blue jeans are essentially neutral
  const WARM = ['red', 'orange', 'yellow', 'pink', 'burgundy', 'coral', 'peach', 'salmon', 'maroon']
  const COOL = ['green', 'purple', 'teal', 'turquoise', 'mint', 'lavender', 'indigo']
  const BOLD_CLASHING = ['red', 'orange', 'yellow', 'purple', 'pink'] // Bold colors that are harder to pair
  
  const colors = items.map(item => {
    // Try primary_color first, then color field, then infer from name
    let color = (item.primary_color || item.color || '').toLowerCase().trim()
    
    // If no color field but name suggests a color, use that
    if (!color) {
      const itemName = (item.name || '').toLowerCase()
      if (itemName.includes('red') || itemName.includes('maroon') || itemName.includes('burgundy')) {
        color = 'red'
      } else if (itemName.includes('blue') || itemName.includes('navy') || itemName.includes('jeans') || itemName.includes('denim')) {
        color = 'blue'
      } else if (itemName.includes('black')) {
        color = 'black'
      } else if (itemName.includes('white')) {
        color = 'white'
      } else if (itemName.includes('gray') || itemName.includes('grey')) {
        color = 'gray'
      } else if (itemName.includes('beige') || itemName.includes('tan')) {
        color = 'beige'
      }
    }
    
    return color
  }).filter(c => c.length > 0)
  
  if (colors.length === 0) {
    // If no colors, try to infer from item names/categories and add variation
    // This gives different scores based on item combinations even without color data
    const itemNames = items.map(item => (item.name || '').toLowerCase())
    
    // Also check category for clues (e.g., if category suggests color)
    const categories = items.map(item => (item.category || '').toLowerCase())
    
    // Check for red in names or labels (be more aggressive in detection)
    const hasRed = itemNames.some(name => 
      name.includes('red') || name.includes('maroon') || name.includes('burgundy') || 
      name.includes('crimson') || name.includes('scarlet')
    ) || categories.some(cat => cat === 'red')
    
    // Check for blue/denim
    const hasBlue = itemNames.some(name => 
      name.includes('blue') || name.includes('navy') || name.includes('jeans') ||
      name.includes('denim') || name.includes('indigo')
    ) || categories.some(cat => cat === 'blue')
    
    // Check for neutrals
    const hasNeutral = itemNames.some(name => 
      name.includes('black') || name.includes('white') || name.includes('gray') || 
      name.includes('grey') || name.includes('beige') || name.includes('tan') ||
      name.includes('charcoal') || name.includes('ivory')
    )
    
    // Count how many items have red vs blue vs neutral
    const redCount = itemNames.filter(name => 
      name.includes('red') || name.includes('maroon') || name.includes('burgundy')
    ).length
    const blueCount = itemNames.filter(name => 
      name.includes('blue') || name.includes('navy') || name.includes('jeans')
    ).length
    
    // Give better scores for likely neutral combinations
    if (hasNeutral && !hasRed) {
      return 0.75 + (items.length * 0.02) // Neutral items likely coordinate well
    } else if (hasBlue && !hasRed && blueCount >= 1) {
      return 0.70 + (items.length * 0.02) // Blue items are versatile
    } else if (hasRed && redCount >= 1) {
      // Red items are harder to coordinate - penalize more
      return 0.55 - (redCount * 0.05) // Each red item makes it harder
    } else if (hasNeutral) {
      return 0.65 + (items.length * 0.02)
    }
    
    // Default variation based on item count and mix
    const itemMixScore = (hasBlue ? 0.1 : 0) - (hasRed ? 0.15 : 0)
    return 0.50 + (items.length * 0.02) + itemMixScore
  }
  
  const uniqueColors = [...new Set(colors)]
  
  // Monochromatic (all same color) - perfect score
  if (uniqueColors.length === 1) return 1.0
  
  // All neutrals (including blue/navy which are effectively neutral) - very high score
  const allNeutralOrBlue = uniqueColors.every(c => 
    NEUTRAL.some(n => c.includes(n) || c === n) || 
    NEUTRAL_BLUE.some(b => c.includes(b))
  )
  if (allNeutralOrBlue) return 0.95
  
  // Check if we have bold/clashing colors that make coordination harder
  const hasBoldColor = uniqueColors.some(c => BOLD_CLASHING.some(b => c.includes(b)))
  const boldColorCount = uniqueColors.filter(c => BOLD_CLASHING.some(b => c.includes(b))).length
  
  // Calculate pair-wise color compatibility
  let compatibilitySum = 0
  let comparisonCount = 0
  
  for (let i = 0; i < uniqueColors.length; i++) {
    for (let j = i + 1; j < uniqueColors.length; j++) {
      comparisonCount++
      const color1 = uniqueColors[i]
      const color2 = uniqueColors[j]
      
      // Same color - perfect match
      if (color1 === color2) {
        compatibilitySum += 1.0
        continue
      }
      
      // Blue/navy is essentially neutral - works with everything
      const color1IsBlue = NEUTRAL_BLUE.some(b => color1.includes(b))
      const color2IsBlue = NEUTRAL_BLUE.some(b => color2.includes(b))
      
      // Both neutral - high compatibility
      if (NEUTRAL.some(n => color1.includes(n) || color1 === n) && 
          NEUTRAL.some(n => color2.includes(n) || color2 === n)) {
        compatibilitySum += 0.95
        continue
      }
      
      // Blue/navy with neutral - excellent (blue jeans are versatile)
      if ((color1IsBlue && NEUTRAL.some(n => color2.includes(n) || color2 === n)) ||
          (color2IsBlue && NEUTRAL.some(n => color1.includes(n) || color1 === n))) {
        compatibilitySum += 0.92
        continue
      }
      
      // Blue/navy with any color - good (blue is versatile)
      if (color1IsBlue || color2IsBlue) {
        // But penalize if the other color is bold/clashing
        if (BOLD_CLASHING.some(b => color1.includes(b) || color2.includes(b))) {
          compatibilitySum += 0.65 // Blue with bold colors = moderate
        } else {
          compatibilitySum += 0.85 // Blue with other colors = good
        }
        continue
      }
      
      // One neutral with colored - good compatibility
      if (NEUTRAL.some(n => color1.includes(n) || color1 === n) || 
          NEUTRAL.some(n => color2.includes(n) || color2 === n)) {
        // BUT: If the colored item is bold (like bright red), penalize more
        const otherColor = NEUTRAL.some(n => color1.includes(n) || color1 === n) ? color2 : color1
        if (BOLD_CLASHING.some(b => otherColor.includes(b))) {
          // Bright red/bold colors with neutrals are harder to pull off
          compatibilitySum += 0.65 // Penalize bold + neutral combinations
        } else {
          compatibilitySum += 0.85
        }
        continue
      }
      
      // Both warm colors
      if (WARM.some(w => color1.includes(w)) && WARM.some(w => color2.includes(w))) {
        // Check if both are bold - this can clash
        const bothBold = BOLD_CLASHING.some(b => color1.includes(b)) && 
                         BOLD_CLASHING.some(b => color2.includes(b))
        if (bothBold) {
          compatibilitySum += 0.5 // Two bold warm colors can clash (e.g., red + orange)
        } else {
          compatibilitySum += 0.75 // Warm colors together = okay
        }
        continue
      }
      
      // Both cool colors
      if (COOL.some(c => color1.includes(c)) && COOL.some(c => color2.includes(c))) {
        compatibilitySum += 0.8
        continue
      }
      
      // Complementary colors (simplified) - moderate score
      const complementaryPairs = [
        ['red', 'green'], ['blue', 'orange'], ['yellow', 'purple'],
        ['navy', 'beige'], ['teal', 'burgundy']
      ]
      const isComplementary = complementaryPairs.some(pair => 
        (color1.includes(pair[0]) || color2.includes(pair[0])) &&
        (color1.includes(pair[1]) || color2.includes(pair[1]))
      )
      if (isComplementary) {
        compatibilitySum += 0.7
        continue
      }
      
      // Mixed warm and cool - lower score (especially if one is bold)
      if ((WARM.some(w => color1.includes(w)) && COOL.some(c => color2.includes(c))) ||
          (COOL.some(c => color1.includes(c)) && WARM.some(w => color2.includes(w)))) {
        // Extra penalty if one is a bold color
        const oneIsBold = BOLD_CLASHING.some(b => color1.includes(b) || color2.includes(b))
        if (oneIsBold) {
          compatibilitySum += 0.35 // Bold warm with cool = clashes badly
        } else {
          compatibilitySum += 0.5 // Regular warm/cool mix
        }
        continue
      }
      
      // Default moderate score for unknown combinations
      compatibilitySum += 0.6
    }
  }
  
  // Average compatibility across all pairs
  const avgCompatibility = comparisonCount > 0 ? compatibilitySum / comparisonCount : 0.6
  
  // Penalties for having bold/clashing colors
  let totalPenalty = 0
  if (hasBoldColor) {
    // The more bold colors, the harder to coordinate
    if (boldColorCount === 1) {
      totalPenalty += 0.08 // Single bold color (like red pants) makes it harder
    } else if (boldColorCount >= 2) {
      totalPenalty += 0.2 // Multiple bold colors = much harder
    }
  }
  
  // Adjust based on number of colors (more colors = harder to coordinate)
  const colorCountPenalty = uniqueColors.length > 3 ? 0.05 : 0
  
  const finalScore = Math.max(0, Math.min(1, avgCompatibility - totalPenalty - colorCountPenalty))
  return finalScore
}

/**
 * Helper function to detect if an item has short sleeves
 */
function isShortSleeved(item) {
  const cat = item.category?.toLowerCase()
  const clothingType = (item.clothing_type || '').toLowerCase()
  const itemName = (item.name || '').toLowerCase()
  
  // Explicit short sleeve types
  if (clothingType === 't-shirt' || clothingType === 'polo' || clothingType === 'top') {
    // Check if it's NOT a long sleeve variant
    if (clothingType.includes('long') || itemName.includes('long sleeve')) {
      return false
    }
    return true
  }
  
  // Explicit long sleeve types
  if (clothingType === 'longsleeve' || clothingType === 'hoodie' || 
      clothingType.includes('long') || itemName.includes('long sleeve')) {
    return false
  }
  
  // Shirt/Blouse: Generally assumed long-sleeved unless name indicates otherwise
  if (cat === 'shirt' || clothingType === 'shirt' || cat === 'blouse' || clothingType === 'blouse') {
    // Check name for short sleeve indicators
    if (itemName.includes('short') || itemName.includes('sleeveless') || 
        itemName.includes('tee') || itemName.includes('t-shirt')) {
      return true
    }
    return false // Default to long sleeves for shirts/blouses
  }
  
  // Other tops: Check name for clues
  if (cat === 'top' || cat === 't-shirt') {
    return !itemName.includes('long sleeve')
  }
  
  return false
}

/**
 * Helper function to detect if an item has long sleeves
 */
function isLongSleeved(item) {
  const cat = item.category?.toLowerCase()
  const clothingType = (item.clothing_type || '').toLowerCase()
  const itemName = (item.name || '').toLowerCase()
  
  // Explicit long sleeve types
  if (clothingType === 'longsleeve' || clothingType === 'hoodie' || 
      clothingType.includes('long') || itemName.includes('long sleeve') ||
      itemName.includes('long-sleeve') || itemName.includes('longsleeve')) {
    return true
  }
  
  // Shirt/Blouse: Generally long-sleeved unless name indicates otherwise
  if (cat === 'shirt' || clothingType === 'shirt' || cat === 'blouse' || clothingType === 'blouse') {
    // Check name for short sleeve indicators
    if (itemName.includes('short') || itemName.includes('sleeveless') || 
        itemName.includes('tee') || itemName.includes('t-shirt') ||
        itemName.includes('t shirt') || itemName.includes('short sleeve')) {
      return false
    }
    return true // Default to long sleeves for shirts/blouses
  }
  
  // Check for sweater indicators (usually long-sleeved)
  if (itemName.includes('sweater') || itemName.includes('jumper') || 
      itemName.includes('cardigan') || itemName.includes('pullover')) {
    return true
  }
  
  // Check for button-up shirt indicators (usually long-sleeved)
  if (itemName.includes('button') || itemName.includes('button-up') || 
      itemName.includes('dress shirt') || itemName.includes('oxford')) {
    return true
  }
  
  return false
}

/**
 * Helper function to detect if an item is shorts
 */
function isShorts(item) {
  const cat = item.category?.toLowerCase()
  const clothingType = (item.clothing_type || '').toLowerCase()
  return cat === 'shorts' || clothingType === 'shorts' || cat === 'skirt' || clothingType === 'skirt'
}

/**
 * Helper function to detect if an item is pants
 */
function isPants(item) {
  const cat = item.category?.toLowerCase()
  const clothingType = (item.clothing_type || '').toLowerCase()
  return cat === 'pants' || clothingType === 'pants' || cat === 'bottom'
}

/**
 * Calculate weather fit score (0-1)
 * Returns a score based on how well items match weather conditions
 * Includes penalties for illogical combinations (e.g., shorts + long sleeves in hot weather)
 * Enhanced to prioritize clothing types based on temperature
 */
function calculateWeatherFitScore(items, weather) {
  const { temperature, condition } = weather
  let totalScore = 0
  
  // Detect outfit combination attributes
  const hasShorts = items.some(item => isShorts(item))
  const hasPants = items.some(item => isPants(item))
  const hasLongSleeves = items.some(item => isLongSleeved(item))
  const hasShortSleeves = items.some(item => isShortSleeved(item))
  
  // Combination penalty for illogical pairings
  let combinationPenalty = 0
  let combinationMultiplier = 1.0 // Use multiplier for severe mismatches
  
  // Additional penalty specifically for long sleeves in hot weather
  let longSleevePenalty = 0
  
  if (temperature >= 31) {
    // Very hot weather (31°C+): shorts + long sleeves is VERY illogical
    if (hasShorts && hasLongSleeves) {
      // This is a severe mismatch - heavily penalize
      combinationPenalty += 0.6 // Heavy penalty
      combinationMultiplier = 0.3 // Also multiply score to really bring it down
    }
    // HEAVY penalty for ANY long sleeves in very hot weather
    if (hasLongSleeves) {
      longSleevePenalty += 0.4 // Additional penalty for long sleeves
      combinationMultiplier = Math.min(combinationMultiplier, 0.5) // Further reduce multiplier
    }
    // Shorts + pants = impossible (can't have both)
    if (hasShorts && hasPants) {
      combinationPenalty += 0.3 // Shouldn't happen but penalize if it does
    }
    // Shorts without clear sleeve type indication
    if (hasShorts && !hasShortSleeves && !hasLongSleeves) {
      combinationPenalty += 0.1 // Slight penalty for unclear
    }
  } else if (temperature >= 26) {
    // Hot weather (26°C+): shorts + long sleeves is illogical
    if (hasShorts && hasLongSleeves) {
      combinationPenalty += 0.5 // Heavy penalty
      combinationMultiplier = 0.4
    }
    // Penalty for long sleeves in hot weather
    if (hasLongSleeves) {
      longSleevePenalty += 0.3 // Additional penalty for long sleeves
      combinationMultiplier = Math.min(combinationMultiplier, 0.6)
    }
    // Shorts without clear sleeve type
    if (hasShorts && !hasShortSleeves && !hasLongSleeves) {
      combinationPenalty += 0.15
    }
  } else if (temperature >= 15) {
    // Moderate temperature (15-25°C): both short and long sleeves work, pants are good
    // No penalties for mixing sleeve types - both are acceptable
    // Shorts + long sleeves is less ideal but not heavily penalized
    if (hasShorts && hasLongSleeves) {
      combinationPenalty += 0.1 // Light penalty only
    }
  } else if (temperature < 15) {
    // Cool weather: shorts shouldn't be worn
    if (hasShorts) {
      combinationPenalty += 0.4 // Strong penalty for shorts in cool weather
      combinationMultiplier = 0.6
    }
    // Short sleeves without outerwear in cool weather is less ideal
    if (hasShortSleeves && !hasLongSleeves && !items.some(item => {
      const cat = item.category?.toLowerCase()
      return cat === 'outerwear' || cat === 'blazer'
    })) {
      combinationPenalty += 0.2 // Short sleeves without layering in cool weather
    }
  }
  
  // Apply long sleeve penalty to combination penalty
  combinationPenalty += longSleevePenalty
  
  // Score each item based on temperature and clothing type
  items.forEach(item => {
    const cat = item.category?.toLowerCase()
    const clothingType = (item.clothing_type || '').toLowerCase()
    const styleTags = item.style_tags || []
    let itemScore = 0
    
    const isShortSleeve = isShortSleeved(item)
    const isLongSleeve = isLongSleeved(item)
    const isShort = isShorts(item)
    const isPant = isPants(item)
    
    // Temperature appropriateness scoring with enhanced clothing type detection
    if (temperature >= 31) {
      // Very hot (31°C+) - STRONGLY prefer T-Shirts, Polos, Shorts
      if (isShort) {
        itemScore += 1.0 // Shorts are perfect for very hot weather
      } else if (isPant) {
        itemScore += 0.3 // Pants are not ideal in very hot weather
        if (styleTags.includes('lightweight')) itemScore += 0.2 // Lightweight pants get bonus
      } else if (isShortSleeve) {
        // T-Shirt, Polo, or other short-sleeved tops
        itemScore += 1.0 // Perfect for very hot weather
      } else if (isLongSleeve) {
        // Longsleeve, Hoodie, long-sleeved Shirt/Blouse
        itemScore += 0.05 // Very bad in very hot weather - HEAVY penalty
      } else if (cat === 'top' || cat === 't-shirt' || cat === 'shirt' || cat === 'blouse') {
        // Unknown sleeve type - check if it's likely a shirt/blouse (often long-sleeved)
        if (cat === 'shirt' || cat === 'blouse') {
          itemScore += 0.2 // Assume long-sleeved if shirt/blouse
        } else {
          itemScore += 0.6 // Unknown top type
        }
      } else if (cat === 'outerwear' || cat === 'blazer') {
        itemScore += 0.05 // Outerwear very bad in very hot weather
      } else {
        itemScore += 0.5
      }
      
      if (styleTags.includes('winter')) itemScore -= 0.3
      if (styleTags.includes('summer')) itemScore += 0.2
    } else if (temperature >= 26) {
      // Hot (26°C+) - prefer shorts with T-Shirts/Polos
      if (isShort) {
        itemScore += 0.95 // Shorts are great for hot weather
      } else if (isPant) {
        itemScore += 0.65 // Pants are okay but shorts better
      } else if (isShortSleeve) {
        // T-Shirt, Polo
        itemScore += 0.95 // Short sleeves perfect for hot weather
      } else if (isLongSleeve) {
        // Longsleeve, Hoodie, long-sleeved Shirt/Blouse
        itemScore += 0.2 // Long sleeves not ideal in hot weather - heavier penalty
      } else if (cat === 'top' || cat === 't-shirt' || cat === 'shirt' || cat === 'blouse') {
        // Unknown sleeve type - check if it's likely a shirt/blouse (often long-sleeved)
        if (cat === 'shirt' || cat === 'blouse') {
          itemScore += 0.3 // Assume long-sleeved if shirt/blouse
        } else {
          itemScore += 0.7 // Unknown top type
        }
      } else if (cat === 'outerwear' && styleTags.includes('lightweight')) {
        itemScore += 0.4 // Lightweight outerwear okay
      } else if (cat === 'outerwear') {
        itemScore += 0.2 // Heavy outerwear not ideal
      } else {
        itemScore += 0.7
      }
      
      if (styleTags.includes('winter')) itemScore -= 0.2
      if (styleTags.includes('summer')) itemScore += 0.2
    } else if (temperature >= 20) {
      // Moderate-Warm (20-25°C) - both short and long sleeves work, favor short sleeves slightly, pants are good
      if (isPant) {
        itemScore += 0.9 // Pants are great for this temperature
      } else if (isShort) {
        itemScore += 0.75 // Shorts are okay but pants better
      } else if (isShortSleeve) {
        // T-Shirt, Polo - slightly favored
        itemScore += 0.85 // Short sleeves work well, slightly favored
      } else if (isLongSleeve) {
        // Longsleeve, Hoodie, long-sleeved Shirt/Blouse
        itemScore += 0.8 // Long sleeves work well too, almost equal
      } else if (cat === 'top' || cat === 't-shirt' || cat === 'shirt' || cat === 'blouse') {
        // Unknown sleeve type
        itemScore += 0.8
      } else if (cat === 'outerwear' && styleTags.includes('lightweight')) {
        itemScore += 0.6 // Lightweight outerwear optional
      } else if (cat === 'outerwear') {
        itemScore += 0.4 // Outerwear optional
      } else {
        itemScore += 0.75
      }
      
      if (styleTags.includes('winter')) itemScore -= 0.1
      if (styleTags.includes('summer')) itemScore += 0.1
    } else if (temperature >= 15) {
      // Moderate (15-19°C) - both short and long sleeves work equally, pants are good
      if (isPant) {
        itemScore += 0.9 // Pants are great for this temperature
      } else if (isShort) {
        itemScore += 0.6 // Shorts less ideal but acceptable
      } else if (isShortSleeve) {
        // T-Shirt, Polo - equal with long sleeves
        itemScore += 0.8 // Short sleeves work well
      } else if (isLongSleeve) {
        // Longsleeve, Hoodie, long-sleeved Shirt/Blouse
        itemScore += 0.8 // Long sleeves work equally well
      } else if (cat === 'top' || cat === 't-shirt' || cat === 'shirt' || cat === 'blouse') {
        // Unknown sleeve type
        itemScore += 0.75
      } else if (cat === 'outerwear') {
        itemScore += 0.6 // Outerwear optional but nice
      } else {
        itemScore += 0.75
      }
      
      if (styleTags.includes('winter')) itemScore += 0.1
      if (styleTags.includes('summer')) itemScore -= 0.05
    } else if (temperature < 15) {
      // Cool (<15°C) - STRONGLY prefer long sleeves, pants, outerwear
      if (isPant) {
        itemScore += 0.95 // Pants are perfect for cool weather
      } else if (isShort) {
        itemScore += 0.1 // Shorts very bad in cool weather
      } else if (isLongSleeve) {
        // Longsleeve, Hoodie, long-sleeved Shirt/Blouse
        itemScore += 0.95 // Long sleeves perfect for cool weather
      } else if (isShortSleeve) {
        // T-Shirt, Polo - okay if layered with outerwear
        itemScore += 0.5 // Short sleeves okay but not ideal
      } else if (cat === 'top' || cat === 't-shirt' || cat === 'shirt' || cat === 'blouse') {
        // Unknown sleeve type
        itemScore += 0.7
      } else if (cat === 'outerwear' || cat === 'blazer') {
        itemScore += 0.95 // Outerwear perfect for cool weather
      } else {
        itemScore += 0.7
      }
      
      if (styleTags.includes('winter') || styleTags.includes('warm')) itemScore += 0.2
      if (styleTags.includes('summer')) itemScore -= 0.2
    }
    
    // Condition appropriateness scoring
    if (condition === 'rain') {
      if (styleTags.includes('waterproof') || styleTags.includes('water-resistant')) {
        itemScore += 0.3
      }
      if (cat === 'outerwear' || cat === 'shoes') itemScore += 0.1
      if (styleTags.includes('delicate') || styleTags.includes('silk')) itemScore -= 0.2
    } else if (condition === 'snow') {
      if (styleTags.includes('winter') || styleTags.includes('waterproof')) itemScore += 0.3
      if (cat === 'outerwear') itemScore += 0.2
      if (styleTags.includes('summer')) itemScore -= 0.3
    }
    
    // Clamp item score to 0-1 range
    itemScore = Math.max(0, Math.min(1, itemScore))
    totalScore += itemScore
  })
  
  // Average score across all items
  let avgScore = items.length > 0 ? totalScore / items.length : 0.5
  
  // Debug logging for hot weather
  if (temperature >= 31) {
    console.log('🌡️ Weather Scoring Debug (31°C+):', {
      hasLongSleeves,
      hasShortSleeves,
      hasShorts,
      hasPants,
      longSleevePenalty,
      combinationPenalty,
      combinationMultiplier,
      avgScoreBeforePenalty: avgScore,
      itemCount: items.length
    })
  }
  
  // Apply combination penalty (subtract from average AND multiply for severe mismatches)
  avgScore = (avgScore - combinationPenalty) * combinationMultiplier
  
  // Ensure score is in valid range
  avgScore = Math.max(0, Math.min(1, avgScore))
  
  if (temperature >= 31) {
    console.log('🌡️ Weather Scoring Debug (31°C+): Final score:', {
      avgScoreAfterPenalty: avgScore,
      percentage: Math.round(avgScore * 100) + '%'
    })
  }
  
  return avgScore
}

/**
 * Calculate completeness score (0-1)
 */
function calculateCompletenessScore(items) {
  let score = 0.5 // Base score
  const hasTop = items.some(item => isTopCategory(item))
  const hasBottom = items.some(item => isBottomCategory(item))
  const hasShoes = items.some(item => {
    const cat = item.category?.toLowerCase()
    return cat === 'shoes' || cat === 'slippers'
  })
  const hasOuterwear = items.some(item => item.category?.toLowerCase() === 'outerwear' || item.category?.toLowerCase() === 'blazer')
  
  if (hasTop && hasBottom) score += 0.3
  if (hasShoes) score += 0.15
  if (hasOuterwear) score += 0.05
  
  return Math.min(1, score)
}

/**
 * Filter clothing items based on weather conditions
 */
function filterItemsByWeather(items, weather) {
  const { temperature, condition } = weather
  
  return items.filter(item => {
    const cat = item.category?.toLowerCase()
    const clothingType = item.clothing_type?.toLowerCase() || cat
    const styleTags = item.style_tags || []
    
    // Temperature-based filtering
    // NOTE: Made less aggressive - we prefer certain items but don't completely exclude others
    // The scoring system will penalize less ideal items, but we still allow them
    if (temperature > 30) {
      // Very hot - prefer short sleeves, shorts, light fabrics
      // But don't completely exclude long sleeves/pants - let scoring handle preference
      if (cat === 'outerwear' || cat === 'blazer') {
        // Only completely exclude outerwear in very hot weather
        return false
      }
      // Allow all tops and bottoms, scoring will handle preference
      return true
    } else if (temperature > 25) {
      // Hot - prefer light items, can include short sleeves and shorts
      if (cat === 'outerwear' && !styleTags.includes('lightweight')) {
        return false // Avoid heavy outerwear
      }
      if (styleTags.includes('winter') || styleTags.includes('heavy')) {
        return false // Avoid winter items
      }
      return true
    } else if (temperature < 15) {
      // Cool - prefer long sleeves, pants, outerwear
      if (cat === 'top') {
        if (clothingType === 't-shirt' && !styleTags.includes('long') && 
            !clothingType.includes('long')) {
          // Allow t-shirts only if layered with outerwear
          return true
        }
        return true
      }
      if (cat === 'shorts') {
        // Avoid shorts in cool weather
        return false
      }
      return true // Allow most items, including outerwear
    } else if (temperature < 5) {
      // Very cold - prefer warm items, avoid shorts and short sleeves
      if (cat === 'shorts' || cat === 'skirt') {
        return false
      }
      if (cat === 'top' && clothingType === 't-shirt' && !styleTags.includes('winter')) {
        return false // Avoid light t-shirts
      }
      if (styleTags.includes('summer')) {
        return false
      }
      return true
    } else {
      // Moderate temperature (15-25°C) - most items suitable
      return true
    }
  }).filter(item => {
    // Weather condition filtering
    if (condition === 'rain') {
      const cat = item.category?.toLowerCase()
      const styleTags = item.style_tags || []
      // Prefer water-resistant items
      if (styleTags.includes('waterproof') || styleTags.includes('water-resistant')) {
        return true
      }
      // Outerwear and shoes are usually okay in rain
      if (cat === 'outerwear' || cat === 'shoes') {
        return true
      }
      // Avoid very light fabrics
      if (styleTags.includes('delicate') || styleTags.includes('silk')) {
        return false
      }
      return true
    } else if (condition === 'snow') {
      const styleTags = item.style_tags || []
      // Prefer warm, water-resistant items
      if (styleTags.includes('winter') || styleTags.includes('waterproof')) {
        return true
      }
      const cat = item.category?.toLowerCase()
      if (cat === 'outerwear') return true
      // Avoid summer items
      if (styleTags.includes('summer')) return false
      return true
    }
    // Clear, clouds, etc. - most items suitable
    return true
  })
}

/**
 * Select item with best color matching using color theory
 * Uses the color compatibility rules from recommendation-service
 */
function selectItemWithColorMatching(candidates, existingItems) {
  if (candidates.length === 0) return null
  if (existingItems.length === 0) {
    // No existing items, return random item
    return candidates[Math.floor(Math.random() * candidates.length)]
  }
  
  // Color compatibility groups
  const NEUTRAL = ['black', 'white', 'gray', 'grey', 'beige', 'navy', 'tan', 'ivory', 'cream', 'charcoal']
  const WARM = ['red', 'orange', 'yellow', 'pink', 'burgundy', 'coral', 'peach', 'salmon']
  const COOL = ['blue', 'green', 'purple', 'teal', 'turquoise', 'mint', 'lavender', 'indigo']
  
  // Score each candidate based on color compatibility
  const scored = candidates.map(candidate => {
    const candidateColor = (candidate.primary_color || candidate.color || '').toLowerCase()
    if (!candidateColor) return { item: candidate, score: 0.5 }
    
    let totalScore = 0
    let comparisons = 0
    
    existingItems.forEach(existing => {
      const existingColor = (existing.primary_color || existing.color || '').toLowerCase()
      if (!existingColor) {
        totalScore += 0.5
        comparisons++
        return
      }
      
      // Same color - high score
      if (candidateColor === existingColor) {
        totalScore += 0.9
        comparisons++
        return
      }
      
      // Both neutral - high score
      if (NEUTRAL.includes(candidateColor) && NEUTRAL.includes(existingColor)) {
        totalScore += 0.95
        comparisons++
        return
      }
      
      // One neutral - good score
      if (NEUTRAL.includes(candidateColor) || NEUTRAL.includes(existingColor)) {
        totalScore += 0.85
        comparisons++
        return
      }
      
      // Both warm - good score
      if (WARM.some(c => candidateColor.includes(c)) && WARM.some(c => existingColor.includes(c))) {
        totalScore += 0.8
        comparisons++
        return
      }
      
      // Both cool - good score
      if (COOL.some(c => candidateColor.includes(c)) && COOL.some(c => existingColor.includes(c))) {
        totalScore += 0.8
        comparisons++
        return
      }
      
      // Default moderate score
      totalScore += 0.5
      comparisons++
    })
    
    const avgScore = comparisons > 0 ? totalScore / comparisons : 0.5
    return { item: candidate, score: avgScore }
  })
  
  // Sort by score and return best match
  scored.sort((a, b) => b.score - a.score)
  return scored[0].item
}

// ============================================
// Recommendation Functions
// ============================================

const getAIRecommendations = async () => {
  try {
    console.log('OutfitCreator: Getting AI recommendations...')
    
    if (wardrobeItems.value.length < 2) {
      showWarning('You need at least 2 items in your closet for recommendations')
      return
    }
    
    recommendingOutfits.value = true
    showRecommendationsModal.value = true
    
    // Generate recommendations
    const recs = await generateRecommendations(wardrobeItems.value, {
      maxRecommendations: 10,
      maxCombinations: 50
    })
    
    recommendations.value = recs
    recommendingOutfits.value = false
    
    if (recs.length === 0) {
      showWarning('No recommendations found. Try adding more items to your closet.')
    } else {
      showSuccess(`Generated ${recs.length} outfit recommendations`)
    }
    
  } catch (error) {
    console.error('OutfitCreator: Error getting recommendations:', error)
    recommendingOutfits.value = false
    showError('Failed to generate recommendations. Please try again.')
  }
}

const loadRecommendation = (rec) => {
  try {
    console.log('OutfitCreator: Loading recommendation:', rec)
    
    // Clear current canvas
    canvasItems.value = []
    
    // Add recommendation items to canvas with non-overlapping placement
    const normalizedItemSize = normalizePosition(128, 'x') // 128px item size normalized
    const BUTTON_AREA_HEIGHT = 80
    const normalizedButtonArea = normalizePosition(BUTTON_AREA_HEIGHT, 'y')
    let currentX = 100
    let currentY = Math.max(100, normalizedButtonArea + 50) // Ensure below button area
    
    const items = rec.items.map((item, index) => {
      // Find non-overlapping position for this item
      const position = findNonOverlappingPosition(
        canvasItems.value, // Existing items on canvas
        normalizedItemSize,
        currentX,
        currentY
      )
      
      // Update current position for next item (spiral pattern)
      currentX = position.x + normalizedItemSize * position.scale + 20
      currentY = position.y + normalizedItemSize * position.scale + 20
      
      const newItem = {
        ...item,
        originalId: item.id,
        id: `canvas-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
        x: position.x,
        y: position.y,
        scale: position.scale,
        rotation: 0,
        z_index: index + 1
      }
      
      canvasItems.value.push(newItem) // Add to canvas so next item can check for overlap
      return newItem
    })
    
    saveToHistory()
    
    // Close modal
    showRecommendationsModal.value = false
    
    showSuccess('Outfit loaded to canvas!')
    
  } catch (error) {
    console.error('OutfitCreator: Error loading recommendation:', error)
    showError('Failed to load outfit. Please try again.')
  }
}

/**
 * Load weather recommendation to canvas
 */
const loadWeatherRecommendation = (rec) => {
  try {
    console.log('OutfitCreator: Loading weather recommendation:', rec)
    
    // Clear current canvas
    canvasItems.value = []
    
    // Add recommendation items to canvas with non-overlapping placement
    const normalizedItemSize = normalizePosition(128, 'x')
    const BUTTON_AREA_HEIGHT = 80
    const normalizedButtonArea = normalizePosition(BUTTON_AREA_HEIGHT, 'y')
    let currentX = 100
    let currentY = Math.max(100, normalizedButtonArea + 50) // Ensure below button area
    
    rec.items.map((item, index) => {
      const position = findNonOverlappingPosition(
        canvasItems.value,
        normalizedItemSize,
        currentX,
        currentY
      )
      
      currentX = position.x + normalizedItemSize * position.scale + 20
      currentY = position.y + normalizedItemSize * position.scale + 20
      
      const newItem = {
        ...item,
        originalId: item.id,
        id: `canvas-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
        x: position.x,
        y: position.y,
        scale: position.scale,
        rotation: 0,
        z_index: index + 1
      }
      
      canvasItems.value.push(newItem)
      return newItem
    })
    
    saveToHistory()
    
    // Close modal
    showWeatherRecommendationsModal.value = false
    
    const weatherInfo = rec.weatherInfo
    showSuccess(`Weather outfit loaded! ${weatherInfo ? `Perfect for ${weatherInfo.temperature}°C in ${weatherInfo.location}` : ''}`)
  } catch (error) {
    console.error('OutfitCreator: Error loading weather recommendation:', error)
    showError('Failed to load weather recommendation')
  }
}

/**
 * Generate weather outfits with a specific item
 */
const generateWeatherOutfitsWithItem = (item) => {
  selectedWardrobeItemForWeather.value = item
  showItemContextMenuState.value = false
  generateWeatherBasedOutfit(item)
}

/**
 * Show context menu for wardrobe item
 */
const showItemContextMenu = (item, event) => {
  contextMenuItem.value = item
  contextMenuPosition.x = event.clientX
  contextMenuPosition.y = event.clientY
  showItemContextMenuState.value = true
}

/**
 * Close context menu
 */
const closeContextMenu = () => {
  showItemContextMenuState.value = false
  contextMenuItem.value = null
}

const scoreOutfitAI = async () => {
  try {
    console.log('OutfitCreator: Scoring outfit with AI...')
    
    if (canvasItems.value.length < 2) {
      showWarning('Need at least 2 items to score an outfit')
      return
    }
    
    scoringOutfit.value = true
    
    // Import fashion transformer service
    const { scoreOutfit, validateOutfitItems } = await import('@/services/fashion-transformer-service')
    
    // Prepare outfit items for scoring
    const outfitItems = canvasItems.value.map(item => ({
      id: item.id,
      name: item.name,
      category: item.category,
      image_url: item.image_url,
      description: item.description || item.name || `${item.category} item`
    }))
    
    // Validate items
    const validation = validateOutfitItems(outfitItems)
    if (!validation.isValid) {
      console.warn('Cannot score outfit:', validation.errors)
      showWarning('Cannot score outfit. Make sure all items have images.')
      scoringOutfit.value = false
      return
    }
    
    // Score the outfit
    const result = await scoreOutfit(outfitItems)
    
    scoringOutfit.value = false
    
    if (result.success) {
      outfitScore.value = result.score
      const scorePercent = Math.round(result.score * 100)
      
      // Show user the score with a nice notification
      let message = `Outfit Compatibility: ${scorePercent}%`
      let type = 'info'
      
      if (scorePercent >= 80) {
        message = `Excellent outfit! ${scorePercent}% compatible`
        type = 'success'
      } else if (scorePercent >= 60) {
        message = `Good outfit combination! ${scorePercent}% compatible`
        type = 'info'
      } else {
        message = `Compatibility score: ${scorePercent}%. Consider trying different combinations.`
        type = 'warning'
      }
      
      // Show notification based on type
      if (type === 'success') {
        showSuccess(message)
      } else if (type === 'warning') {
        showWarning(message)
      } else {
        showInfo(message)
      }
      
      console.log('OutfitCreator: Outfit scored:', scorePercent + '%')
    } else {
      showError(result.error || 'Failed to score outfit')
    }
    
  } catch (error) {
    console.error('OutfitCreator: Error scoring outfit:', error)
    scoringOutfit.value = false
    showError('Failed to score outfit. Please try again.')
  }
}

const addItemToCanvas = (item) => {
  // Validate: Maximum 10 items on canvas
  if (canvasItems.value.length >= 10) {
    showWarning('Maximum 10 items allowed on canvas. Please remove an item before adding a new one.')
    return
  }
  
  // Check if item already exists on canvas (by originalId)
  const itemAlreadyOnCanvas = canvasItems.value.some(canvasItem => canvasItem.originalId === item.id)
  if (itemAlreadyOnCanvas) {
    showWarning('This item is already on the canvas. Each item can only be added once.')
    return
  }
  
  if (!canvasContainer.value) return
  
  const rect = canvasContainer.value.getBoundingClientRect()
  const itemSize = 128
  const normalizedItemSize = normalizePosition(itemSize, 'x') // Use x scale as item is square
  
  // Define button area exclusion zones
  // Top area: 80px (for top-center buttons)
  const TOP_BUTTON_AREA_HEIGHT = 80
  const normalizedTopButtonArea = normalizePosition(TOP_BUTTON_AREA_HEIGHT, 'y')
  
  // Bottom area: 80px (for bottom-center toolbar)
  const BOTTOM_BUTTON_AREA_HEIGHT = 80
  const normalizedBottomButtonArea = normalizePosition(BOTTOM_BUTTON_AREA_HEIGHT, 'y')
  
  // Start position: center of canvas, but below top button area and above bottom button area
  const centerX = REFERENCE_CANVAS_WIDTH / 2
  const maxYPosition = REFERENCE_CANVAS_HEIGHT - (normalizedItemSize) - normalizedBottomButtonArea
  const centerY = Math.max(
    normalizedTopButtonArea + 100, // Ensure below top button area
    Math.min((REFERENCE_CANVAS_HEIGHT / 2), maxYPosition) // And above bottom button area
  )
  
  // Find a non-overlapping position (may reduce scale if needed)
  const position = findNonOverlappingPosition(
    canvasItems.value,
    normalizedItemSize,
    centerX,
    centerY
  )
  
  // Ensure new items start with z_index >= 2 (above grid)
  const baseZIndex = Math.max(2, canvasItems.value.length + 2)
  
  // Calculate max Y position to avoid bottom button area
  const maxYPositionForItem = REFERENCE_CANVAS_HEIGHT - (normalizedItemSize * position.scale) - normalizedBottomButtonArea
  
  const newItem = {
    ...item,
    originalId: item.id, // Store original clothing item ID
    id: `canvas-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // Unique canvas ID (not UUID)
    x: Math.max(0, Math.min(position.x, REFERENCE_CANVAS_WIDTH - (normalizedItemSize * position.scale))),
    y: Math.max(normalizedTopButtonArea, Math.min(position.y, maxYPositionForItem)),
    z_index: baseZIndex,
    rotation: 0,
    scale: position.scale // Use scaled size from findNonOverlappingPosition
  }
  
  canvasItems.value.push(newItem)
  saveToHistory()
  selectedItemId.value = newItem.id
}

const handleDragStart = (item, event) => {
  event.dataTransfer.setData('text/plain', item.id)
  event.dataTransfer.effectAllowed = 'move'
}

// Touch-based drag and drop state for mobile
const touchDragItem = ref(null)
const touchDragStartPos = ref({ x: 0, y: 0 })

const handleWardrobeTouchStart = (item, event) => {
  const touch = event.touches[0]
  touchDragItem.value = item
  touchDragStartPos.value = { x: touch.clientX, y: touch.clientY }
  
  // Attach document-level listeners for better tracking
  document.addEventListener('touchmove', handleWardrobeTouchMove, { passive: false })
  document.addEventListener('touchend', handleWardrobeTouchEnd)
  document.addEventListener('touchcancel', handleWardrobeTouchEnd)
}

const handleWardrobeTouchMove = (event) => {
  // Track dragging but don't prevent default scrolling unless actually dragging
  if (touchDragItem.value && event.touches.length > 0) {
    const touch = event.touches[0]
    const deltaX = Math.abs(touch.clientX - touchDragStartPos.value.x)
    const deltaY = Math.abs(touch.clientY - touchDragStartPos.value.y)
    
    // If moved more than 10px, consider it a drag
    if (deltaX > 10 || deltaY > 10) {
      event.preventDefault() // Prevent scrolling while dragging
    }
  }
}

const handleWardrobeTouchEnd = (event) => {
  // Clean up listeners
  document.removeEventListener('touchmove', handleWardrobeTouchMove)
  document.removeEventListener('touchend', handleWardrobeTouchEnd)
  document.removeEventListener('touchcancel', handleWardrobeTouchEnd)
  
  // If touch ended without significant movement, let click handler add item
  touchDragItem.value = null
  touchDragStartPos.value = { x: 0, y: 0 }
}

const handleCanvasTouchMove = (event) => {
  // Allow dragging if we're dragging from wardrobe
  if (touchDragItem.value && event.touches.length > 0) {
    event.preventDefault()
  }
}

const handleCanvasTouchEnd = (event) => {
  // Handle drop from wardrobe on mobile
  if (touchDragItem.value && canvasContainer.value && event.changedTouches.length > 0) {
    const touch = event.changedTouches[0]
    const rect = canvasContainer.value.getBoundingClientRect()
    
    // Check if touch ended within canvas bounds
    if (touch.clientX >= rect.left && touch.clientX <= rect.right &&
        touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
      
      // Create a synthetic drop event
      const syntheticEvent = {
        preventDefault: () => {},
        dataTransfer: {
          getData: () => touchDragItem.value.id
        },
        clientX: touch.clientX,
        clientY: touch.clientY
      }
      
      handleDrop(syntheticEvent)
    }
    
    touchDragItem.value = null
    touchDragStartPos.value = { x: 0, y: 0 }
  }
}

const handleDrop = (event) => {
  event.preventDefault()
  
  // Validate: Maximum 10 items on canvas
  if (canvasItems.value.length >= 10) {
    showWarning('Maximum 10 items allowed on canvas. Please remove an item before adding a new one.')
    return
  }
  
  const itemId = event.dataTransfer.getData('text/plain')
  const item = wardrobeItems.value.find(i => i.id === itemId)
  
  if (item) {
    // Check if item already exists on canvas (by originalId)
    const itemAlreadyOnCanvas = canvasItems.value.some(canvasItem => canvasItem.originalId === item.id)
    if (itemAlreadyOnCanvas) {
      showWarning('This item is already on the canvas. Each item can only be added once.')
      return
    }
    
    const rect = canvasContainer.value.getBoundingClientRect()
    const itemSize = 128
    const dropX = event.clientX - rect.left
    const dropY = event.clientY - rect.top
    
    // Normalize drop position to reference canvas size
    const normalizedDropX = normalizePosition(dropX, 'x')
    const normalizedDropY = normalizePosition(dropY, 'y')
    const normalizedItemSize = normalizePosition(itemSize, 'x') // Use x scale as item is square
    
    // Find a non-overlapping position (may reduce scale if needed)
    const position = findNonOverlappingPosition(
      canvasItems.value,
      normalizedItemSize,
      normalizedDropX,
      normalizedDropY
    )
    
    // Define button area exclusion zones
    // Top area: 80px (for top-center buttons)
    const TOP_BUTTON_AREA_HEIGHT = 80
    const normalizedTopButtonArea = normalizePosition(TOP_BUTTON_AREA_HEIGHT, 'y')
    
    // Bottom area: 80px (for bottom-center toolbar)
    const BOTTOM_BUTTON_AREA_HEIGHT = 80
    const normalizedBottomButtonArea = normalizePosition(BOTTOM_BUTTON_AREA_HEIGHT, 'y')
    const maxYPosition = REFERENCE_CANVAS_HEIGHT - (normalizedItemSize * position.scale) - normalizedBottomButtonArea
    
    // Ensure new items start with z_index >= 2 (above grid)
    const baseZIndex = Math.max(2, canvasItems.value.length + 2)
    
    const newItem = {
      ...item,
      originalId: item.id, // Store original clothing item ID
      id: `canvas-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // Unique canvas ID (not UUID)
      x: Math.max(0, Math.min(position.x, REFERENCE_CANVAS_WIDTH - (normalizedItemSize * position.scale))),
      y: Math.max(normalizedTopButtonArea, Math.min(position.y, maxYPosition)),
      z_index: baseZIndex,
      rotation: 0,
      scale: position.scale
    }
    
    canvasItems.value.push(newItem)
    saveToHistory()
    selectedItemId.value = newItem.id
  }
}

// Drag state
const draggedItem = ref(null)
const dragOffset = reactive({ x: 0, y: 0 })
const isDragging = ref(false)
const touchStartPosition = ref({ x: 0, y: 0 })
const hasDragged = ref(false) // Track if user actually dragged vs just tapped

// Mobile tooltip handlers
const touchStartTime = ref(0)
const touchStartItemId = ref(null)

const handleTouchStart = (item, event) => {
  // Store touch start time and item for tooltip detection
  touchStartTime.value = Date.now()
  touchStartItemId.value = item.id
  hasDragged.value = false
  
  // Clear any existing tooltip timeout
  if (tooltipTimeout.value) {
    clearTimeout(tooltipTimeout.value)
    tooltipTimeout.value = null
  }
  
  // Show tooltip after 500ms if user hasn't moved (long press)
  // Allow tooltip to show even if item is selected (user might want to see info again)
  tooltipTimeout.value = setTimeout(() => {
    // Only show tooltip if user is still touching and hasn't dragged
    if (touchStartItemId.value === item.id && !hasDragged.value && !draggedItem.value) {
      showTooltip(item, event)
    }
  }, 500)
  
  // Initialize drag state but don't actually start dragging until movement is detected
  const isTouch = event.touches && event.touches.length > 0
  const clientX = isTouch ? event.touches[0].clientX : event.clientX
  const clientY = isTouch ? event.touches[0].clientY : event.clientY
  
  // Store touch start position for drag detection
  touchStartPosition.value = { x: clientX, y: clientY }
  
  // Prevent default to avoid scrolling on mobile
  if (isTouch) {
    event.preventDefault()
    // Attach touch event listeners to document for better mobile support
    document.addEventListener('touchmove', handleTouchMove, { passive: false })
    document.addEventListener('touchend', handleTouchEnd)
    document.addEventListener('touchcancel', handleTouchEnd)
  }
  
  // Set selected item immediately (for visual feedback)
  selectedItemId.value = item.id
  
  // Initialize drag offset for when dragging actually starts
  // Don't set draggedItem immediately - wait until user actually moves
  // This allows tooltip to show on long press
  // draggedItem will be set in handleTouchMove when movement is detected
  if (canvasContainer.value) {
    const rect = canvasContainer.value.getBoundingClientRect()
    dragOffset.x = clientX - rect.left - scalePosition(item.x, 'x')
    dragOffset.y = clientY - rect.top - scalePosition(item.y, 'y')
  }
}

const handleTouchMoveTooltip = (e) => {
  // Cancel tooltip if user moves finger (dragging detected)
  if (tooltipTimeout.value) {
    clearTimeout(tooltipTimeout.value)
    tooltipTimeout.value = null
  }
  
  // Detect if user is actually dragging (moved more than 5px)
  if (e.touches && e.touches.length > 0 && touchStartPosition.value) {
    const touch = e.touches[0]
    const deltaX = Math.abs(touch.clientX - touchStartPosition.value.x)
    const deltaY = Math.abs(touch.clientY - touchStartPosition.value.y)
    
    if (deltaX > 5 || deltaY > 5) {
      hasDragged.value = true
      hideTooltip()
    }
  } else {
    hideTooltip()
  }
}

const handleTouchEndTooltip = (e) => {
  // Clear tooltip timeout
  if (tooltipTimeout.value) {
    clearTimeout(tooltipTimeout.value)
    tooltipTimeout.value = null
  }
  
  // Hide tooltip after a short delay (unless user is dragging)
  if (!hasDragged.value && tooltipItemId.value) {
    setTimeout(() => {
      hideTooltip()
    }, 2000)
  } else {
    hideTooltip()
  }
  
  touchStartItemId.value = null
}

const showTooltip = (item, event) => {
  if (!canvasContainer.value) return
  
  const rect = canvasContainer.value.getBoundingClientRect()
  // Get touch position from the event or use stored position
  const touch = event?.touches?.[0] || event?.changedTouches?.[0]
  
  if (!touch && !touchStartPosition.value) return
  
  // Use touch position or fallback to stored position
  const clientX = touch?.clientX || touchStartPosition.value.x
  const clientY = touch?.clientY || touchStartPosition.value.y
  
  tooltipItemId.value = item.id
  
  // Get item position for better tooltip placement
  const itemX = scalePosition(item.x, 'x')
  const itemY = scalePosition(item.y, 'y')
  
  // Position tooltip above the item, centered horizontally
  tooltipPosition.value = {
    x: itemX + 64, // Center on item (item is 128px wide, so center is at 64px)
    y: itemY - 40 // Position above touch point
  }
  
  // Ensure tooltip stays within canvas bounds (accounting for transform translateX(-50%))
  if (tooltipPosition.value.x < 100) tooltipPosition.value.x = 100
  if (tooltipPosition.value.x > rect.width - 100) tooltipPosition.value.x = rect.width - 100
  if (tooltipPosition.value.y < 10) tooltipPosition.value.y = itemY + 140 // Show below if no space above
}

const hideTooltip = () => {
  tooltipItemId.value = null
}

const getTooltipText = (itemId) => {
  const item = canvasItems.value.find(i => i.id === itemId)
  if (!item) return ''
  return `${item.name}${item.category ? ` - ${item.category.charAt(0).toUpperCase() + item.category.slice(1)}` : ''}`
}

const startDrag = (item, event) => {
  // Handle both mouse and touch events
  const isTouch = event.touches && event.touches.length > 0
  const clientX = isTouch ? event.touches[0].clientX : event.clientX
  const clientY = isTouch ? event.touches[0].clientY : event.clientY
  
  // Hide tooltip when dragging starts
  hideTooltip()
  
  // Prevent default to avoid scrolling on mobile
  if (isTouch) {
    event.preventDefault()
    // Store touch start position to detect if it's a drag vs tap
    touchStartPosition.value = { x: clientX, y: clientY }
    // Attach touch event listeners to document for better mobile support
    document.addEventListener('touchmove', handleTouchMove, { passive: false })
    document.addEventListener('touchend', handleTouchEnd)
    document.addEventListener('touchcancel', handleTouchEnd)
  }
  
  isDragging.value = false // Reset dragging state
  hasDragged.value = false // Reset drag flag
  selectedItemId.value = item.id
  
  draggedItem.value = item.id
  if (canvasContainer.value) {
    const rect = canvasContainer.value.getBoundingClientRect()
    // item.x and item.y are normalized, so we need to scale them for drag offset calculation
    dragOffset.x = clientX - rect.left - scalePosition(item.x, 'x')
    dragOffset.y = clientY - rect.top - scalePosition(item.y, 'y')
  }
}

// Helper to get client coordinates from either mouse or touch event
const getClientCoordinates = (e) => {
  if (e.touches && e.touches.length > 0) {
    return { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  return { x: e.clientX, y: e.clientY }
}

const handleMouseMove = (e) => {
  if (!draggedItem.value || !canvasContainer.value) return
  
  const coords = getClientCoordinates(e)
  const rect = canvasContainer.value.getBoundingClientRect()
  const x = coords.x - rect.left - dragOffset.x
  const y = coords.y - rect.top - dragOffset.y
  
  const item = canvasItems.value.find(i => i.id === draggedItem.value)
  if (item) {
    // Calculate item size (scaled)
    const itemSize = 128 * (item.scale || 1)
    const normalizedItemSize = normalizePosition(itemSize, 'x')
    
    // Define button area exclusion zones
    // Top area: 80px (for top-center buttons)
    const TOP_BUTTON_AREA_HEIGHT = 80
    const normalizedTopButtonArea = normalizePosition(TOP_BUTTON_AREA_HEIGHT, 'y')
    
    // Bottom area: 80px (for bottom-center toolbar)
    const BOTTOM_BUTTON_AREA_HEIGHT = 80
    const normalizedBottomButtonArea = normalizePosition(BOTTOM_BUTTON_AREA_HEIGHT, 'y')
    const maxY = normalizePosition(rect.height - itemSize, 'y')
    const minY = maxY - normalizedBottomButtonArea // Prevent items from going into bottom button area
    
    // Normalize positions to reference canvas size for consistent storage
    const normalizedX = normalizePosition(x, 'x')
    const normalizedY = normalizePosition(y, 'y')
    
    // Constrain X: stay within canvas bounds
    // Constrain Y: stay above top button area AND above bottom button area
    item.x = Math.max(0, Math.min(normalizedX, normalizePosition(rect.width - itemSize, 'x')))
    item.y = Math.max(
      normalizedTopButtonArea, // Above top buttons
      Math.min(normalizedY, minY) // Above bottom buttons
    )
  }
}

const handleMouseUp = () => {
  if (draggedItem.value) {
    draggedItem.value = null
    saveToHistory()
  }
}

// Touch event handlers
const handleTouchMove = (e) => {
  // Cancel tooltip if dragging
  if (tooltipTimeout.value) {
    clearTimeout(tooltipTimeout.value)
    tooltipTimeout.value = null
  }
  
  // Detect if user is actually dragging (moved more than 5px)
  if (e.touches && e.touches.length > 0 && touchStartPosition.value) {
    const touch = e.touches[0]
    const deltaX = Math.abs(touch.clientX - touchStartPosition.value.x)
    const deltaY = Math.abs(touch.clientY - touchStartPosition.value.y)
    
    // If moved more than 5px, consider it a drag and start dragging
    if (deltaX > 5 || deltaY > 5) {
      isDragging.value = true
      hasDragged.value = true // Mark that dragging occurred
      
      // Hide tooltip when dragging starts
      hideTooltip()
      
      // Initialize drag state if not already set
      if (!draggedItem.value && touchStartItemId.value) {
        const item = canvasItems.value.find(i => i.id === touchStartItemId.value)
        if (item) {
          draggedItem.value = item.id
          if (canvasContainer.value) {
            const rect = canvasContainer.value.getBoundingClientRect()
            dragOffset.x = touch.clientX - rect.left - scalePosition(item.x, 'x')
            dragOffset.y = touch.clientY - rect.top - scalePosition(item.y, 'y')
          }
        }
      }
      
      e.preventDefault() // Prevent scrolling while dragging
    }
  }
  
  // If dragging is active, update item position
  if (draggedItem.value && canvasContainer.value) {
    const coords = getClientCoordinates(e)
    const rect = canvasContainer.value.getBoundingClientRect()
    const x = coords.x - rect.left - dragOffset.x
    const y = coords.y - rect.top - dragOffset.y
    
    const item = canvasItems.value.find(i => i.id === draggedItem.value)
    if (item) {
      // Calculate item size (scaled)
      const itemSize = 128 * (item.scale || 1)
      const normalizedItemSize = normalizePosition(itemSize, 'x')
      
      // Define button area exclusion zones
      // Top area: 80px (for top-center buttons)
      const TOP_BUTTON_AREA_HEIGHT = 80
      const normalizedTopButtonArea = normalizePosition(TOP_BUTTON_AREA_HEIGHT, 'y')
      
      // Bottom area: 80px (for bottom-center toolbar)
      const BOTTOM_BUTTON_AREA_HEIGHT = 80
      const normalizedBottomButtonArea = normalizePosition(BOTTOM_BUTTON_AREA_HEIGHT, 'y')
      const maxY = normalizePosition(rect.height - itemSize, 'y')
      const minY = maxY - normalizedBottomButtonArea // Prevent items from going into bottom button area
      
      // Normalize positions to reference canvas size for consistent storage
      const normalizedX = normalizePosition(x, 'x')
      const normalizedY = normalizePosition(y, 'y')
      
      // Constrain X: stay within canvas bounds
      // Constrain Y: stay above top button area AND above bottom button area
      item.x = Math.max(0, Math.min(normalizedX, normalizePosition(rect.width - itemSize, 'x')))
      item.y = Math.max(
        normalizedTopButtonArea, // Above top buttons
        Math.min(normalizedY, minY) // Above bottom buttons
      )
    }
  }
}

const handleTouchEnd = (e) => {
  // Clear tooltip timeout
  if (tooltipTimeout.value) {
    clearTimeout(tooltipTimeout.value)
    tooltipTimeout.value = null
  }
  
  const wasDragging = hasDragged.value
  
  if (draggedItem.value) {
    handleMouseUp() // Reuse the same logic
  }
  
  // Remove touch event listeners
  document.removeEventListener('touchmove', handleTouchMove)
  document.removeEventListener('touchend', handleTouchEnd)
  document.removeEventListener('touchcancel', handleTouchEnd)
  
  // Hide tooltip after a short delay if user didn't drag (was just a tap/long press)
  if (!wasDragging && tooltipItemId.value) {
    // Keep tooltip visible for a bit longer so user can read it
    setTimeout(() => {
      hideTooltip()
    }, 2000)
  } else if (wasDragging) {
    // Hide tooltip immediately if user was dragging
    hideTooltip()
  }
  
  // Reset flags after a short delay to allow click prevention
  setTimeout(() => {
    isDragging.value = false
    draggedItem.value = null
    touchStartPosition.value = { x: 0, y: 0 }
    if (!wasDragging) {
      hasDragged.value = false
    }
  }, 100)
  
  touchStartItemId.value = null
}

const selectItem = (itemId) => {
  // Select the item - stays selected until another item is selected or canvas is clicked
  selectedItemId.value = itemId
}

// Handle item click (only if not dragging)
const handleItemClick = (itemId, event) => {
  // Hide tooltip on click
  hideTooltip()
  
  // Don't select if user just dragged (not a tap)
  if (!hasDragged.value) {
    selectItem(itemId)
  }
  // Reset hasDragged after click handling
  setTimeout(() => {
    hasDragged.value = false
  }, 200)
}

const deselectItem = () => {
  selectedItemId.value = null
  hideTooltip() // Hide tooltip when deselecting
}

const clearCanvas = () => {
  canvasItems.value = []
  selectedItemId.value = null
  // Clear virtual try-on when canvas is cleared
  virtualTryOnImageUrl.value = null
  virtualTryOnItemIds.value = null
  saveToHistory()
}

const toggleGrid = () => {
  showGrid.value = !showGrid.value
}

const scaleSelectedItem = (delta) => {
  if (!selectedItemId.value) return
  
  const item = canvasItems.value.find(i => i.id === selectedItemId.value)
  if (item) {
    const newScale = Math.max(0.3, Math.min(3, (item.scale || 1) + delta))
    item.scale = newScale
    saveToHistory()
  }
}

const rotateSelectedItem = (degrees) => {
  if (!selectedItemId.value) return
  
  const item = canvasItems.value.find(i => i.id === selectedItemId.value)
  if (item) {
    item.rotation = (item.rotation || 0) + degrees
    saveToHistory()
  }
}

const moveSelectedItemForward = () => {
  if (!selectedItemId.value) return
  
  const itemIndex = canvasItems.value.findIndex(i => i.id === selectedItemId.value)
  if (itemIndex === -1) return
  
  const item = canvasItems.value[itemIndex]
  
  // Ensure item has a z_index (normalize old items that might have 0 or undefined)
  const currentZIndex = Math.max(2, item.z_index || 2)
  
  // Get all items with their z-indexes normalized
  const itemsWithZ = canvasItems.value.map((i, idx) => ({
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
      canvasItems.value = canvasItems.value.map((i) => {
        if (i.id === item.id) {
          return { ...i, z_index: swapItem.normalizedZ }
        } else if (i.id === swapItem.id) {
          return { ...i, z_index: currentZIndex }
        }
        return i
      })
      console.log(`Swapped z-index: ${item.id} now ${swapItem.normalizedZ}, ${swapItem.id} now ${currentZIndex}`)
    } else {
      // Fallback: just increment
      const maxZIndex = Math.max(...itemsWithZ.map(i => i.normalizedZ), 2)
      canvasItems.value = canvasItems.value.map((i) => 
        i.id === item.id ? { ...i, z_index: maxZIndex + 1 } : i
      )
      console.log(`Incremented z-index: ${item.id} now ${maxZIndex + 1}`)
    }
  } else {
    // No items above, move to front
    const maxZIndex = Math.max(...itemsWithZ.map(i => i.normalizedZ), 2)
    canvasItems.value = canvasItems.value.map((i) => 
      i.id === item.id ? { ...i, z_index: maxZIndex + 1 } : i
    )
    console.log(`Moved to front: ${item.id} now ${maxZIndex + 1}`)
  }
  
  saveToHistory()
}

const moveSelectedItemBackward = () => {
  if (!selectedItemId.value) return
  
  const itemIndex = canvasItems.value.findIndex(i => i.id === selectedItemId.value)
  if (itemIndex === -1) return
  
  const item = canvasItems.value[itemIndex]
  
  // Ensure item has a z_index (normalize old items that might have 0 or undefined)
  const currentZIndex = Math.max(2, item.z_index || 2)
  
  // Get min z-index among all items (normalize all to ensure minimum of 2)
  const itemsWithZ = canvasItems.value.map((i, idx) => ({
    ...i,
    index: idx,
    normalizedZ: Math.max(2, i.z_index || 2)
  }))
  const minZIndex = Math.min(...itemsWithZ.map(i => i.normalizedZ), 2)
  
  // If already at min (2), do nothing
  if (currentZIndex <= minZIndex) {
    console.log('Item already at back')
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
      canvasItems.value = canvasItems.value.map((i) => {
        if (i.id === item.id) {
          return { ...i, z_index: swapItem.normalizedZ }
        } else if (i.id === swapItem.id) {
          return { ...i, z_index: currentZIndex }
        }
        return i
      })
      console.log(`Swapped z-index: ${item.id} now ${swapItem.normalizedZ}, ${swapItem.id} now ${currentZIndex}`)
    } else {
      // Fallback: just decrement (but ensure minimum of 2)
      canvasItems.value = canvasItems.value.map((i) => 
        i.id === item.id ? { ...i, z_index: Math.max(2, currentZIndex - 1) } : i
      )
      console.log(`Decremented z-index: ${item.id} now ${Math.max(2, currentZIndex - 1)}`)
    }
  } else {
    // No items below, just decrement (but ensure minimum of 2)
    canvasItems.value = canvasItems.value.map((i) => 
      i.id === item.id ? { ...i, z_index: Math.max(2, currentZIndex - 1) } : i
    )
    console.log(`Moved backward: ${item.id} now ${Math.max(2, currentZIndex - 1)}`)
  }
  
  saveToHistory()
}

const deleteSelectedItem = () => {
  if (!selectedItemId.value) return
  
  canvasItems.value = canvasItems.value.filter(item => item.id !== selectedItemId.value)
  selectedItemId.value = null
  saveToHistory()
}

const validateOutfit = () => {
  // Validate: Minimum 2 items
  if (canvasItems.value.length < 2) {
    showWarning('An outfit must have at least 2 items. Please add more items to your canvas.')
    return false
  }
  
  // Validate: At least one top and one bottom
  const hasTop = canvasItems.value.some(item => {
    const category = item.category?.toLowerCase()
    return category === 'top' || category === 't-shirt' || category === 'shirt' || 
           category === 'blouse' || category === 'hoodie' || category === 'longsleeve' || 
           category === 'polo' || category === 'body' || category === 'undershirt' ||
           category === 'outerwear' || category === 'blazer'
  })
  
  const hasBottom = canvasItems.value.some(item => {
    const category = item.category?.toLowerCase()
    return category === 'bottom' || category === 'pants' || category === 'shorts' || category === 'skirt'
  })
  
  if (!hasTop) {
    showWarning('An outfit must include at least one top or outerwear item.')
    return false
  }
  
  if (!hasBottom) {
    showWarning('An outfit must include at least one bottom item.')
    return false
  }
  
  // Validate: Maximum 10 items
  if (canvasItems.value.length > 10) {
    showWarning('An outfit can have a maximum of 10 items. Please remove some items.')
    return false
  }
  
  return true
}

const saveOutfit = async () => {
  if (canvasItems.value.length === 0) return
  
  // Validate outfit before saving
  if (!validateOutfit()) {
    return
  }
  
  savingOutfit.value = true
  try {
    if (currentSubRoute.value === 'friend') {
      // Share outfit with friend (create suggestion)
      await shareOutfitWithFriend()
    } else {
      // Save outfit to own collection
      await saveOwnOutfit()
    }
  } catch (error) {
    console.error('OutfitCreator: Error in saveOutfit:', error)
    showError('Failed to save outfit. Please try again.')
  } finally {
    savingOutfit.value = false
  }
}

const saveOwnOutfit = async () => {
  try {
    const isEditing = !!currentOutfitId.value
    console.log('OutfitCreator: Saving own outfit (editing:', isEditing, ')')
    
    // Prompt for outfit name (pre-fill with current name if editing)
    const defaultName = isEditing 
      ? currentOutfitName.value 
      : `Outfit ${new Date().toLocaleDateString()}`
    
    // Show input popup instead of browser prompt
    showPrompt({
      title: 'Save Outfit',
      message: 'Enter a name for your outfit:',
      defaultValue: defaultName,
      placeholder: 'Outfit name',
      confirmText: 'Save',
      cancelText: 'Cancel',
      onConfirm: async (outfitName) => {
        if (!outfitName || !outfitName.trim()) {
          console.log('OutfitCreator: Save cancelled - empty name')
          return
        }
        
        try {
          savingOutfit.value = true
          
          const outfitData = {
            outfit_name: outfitName.trim(),
            description: 'Created in Outfit Creator',
            occasion: null,
            weather_condition: null,
          items: canvasItems.value.map(item => ({
            clothing_item_id: item.originalId || item.id, // Use stored original ID
            // Positions are already normalized to reference canvas size (REFERENCE_CANVAS_WIDTH/HEIGHT)
            // They are stored in item.x and item.y as reference coordinates, not screen coordinates
            x_position: item.x || 0,
            y_position: item.y || 0,
            z_index: item.z_index || 1,
            rotation: item.rotation || 0,
            scale: item.scale || 1
          }))
          }
          
          let result
          if (isEditing) {
            // Update existing outfit
            console.log('OutfitCreator: Updating outfit:', currentOutfitId.value, outfitData)
            result = await outfitsService.updateOutfit(currentOutfitId.value, outfitData)
            
            if (result && result.id) {
              console.log('OutfitCreator: Outfit updated successfully:', result.id)
              showSuccess('Outfit updated successfully!')
              // Navigate back to outfits gallery
              router.push('/outfits')
            } else {
              throw new Error('Failed to update outfit')
            }
          } else {
            // Create new outfit
            console.log('OutfitCreator: Creating outfit:', outfitData)
            result = await outfitsService.createOutfit(outfitData)
            
            if (result && result.id) {
              console.log('OutfitCreator: Outfit created successfully:', result.id)
              showSuccess('Outfit saved successfully!')
              // Navigate back to outfits gallery
              router.push('/outfits')
            } else {
              throw new Error('Failed to create outfit')
            }
          }
        } catch (error) {
          console.error('OutfitCreator: Error saving own outfit:', error)
          showError('Failed to save outfit. Please try again.')
        } finally {
          savingOutfit.value = false
        }
      },
      onCancel: () => {
        console.log('OutfitCreator: Save cancelled by user')
      }
    })
  } catch (error) {
    console.error('OutfitCreator: Error in saveOwnOutfit:', error)
  }
}

const shareOutfitWithFriend = async () => {
  try {
    if (!friendProfile.value) {
      showError('Friend profile not loaded. Please try again.')
      return
    }
    
    console.log('OutfitCreator: Showing share outfit dialog for friend:', friendProfile.value.username)
    
    // Show the dialog to get outfit name
    showShareOutfitDialog.value = true
  } catch (error) {
    console.error('OutfitCreator: Error showing share outfit dialog:', error)
    showError('Failed to share outfit. Please try again.')
  }
}

const handleShareOutfit = async (outfitName) => {
  try {
    if (!friendProfile.value) {
      showError('Friend profile not loaded. Please try again.')
      return
    }
    
    // Validate outfit name is provided
    if (!outfitName || !outfitName.trim()) {
      showError('Please provide an outfit name.')
      return
    }
    
    console.log('OutfitCreator: Sharing outfit with friend:', friendProfile.value.username)
    console.log('OutfitCreator: Outfit name:', outfitName)
    
    // Extract original clothing item IDs and details from canvas items
    const outfitItemsData = canvasItems.value.map(item => ({
      clothes_id: item.originalId || item.id, // Use stored original ID
      name: item.name || 'Unnamed Item', // Include item name
      category: item.category || 'top', // Include category
      image_url: item.image_url || '', // Include image URL
      x_position: item.x,
      y_position: item.y,
      z_index: item.z_index || 1,
      rotation: item.rotation || 0,
      scale: item.scale || 1
    }))
    
    console.log('OutfitCreator: Creating friend outfit suggestion with items:', outfitItemsData)
    
    // Create friend outfit suggestion via NotificationsService
    // This will create a notification for the friend
    // Pass the outfit name as the message to display to the friend
    const result = await notificationsService.createFriendOutfitSuggestion(
      friendProfile.value.id,
      outfitItemsData,
      outfitName // Outfit name is now the message to the friend
    )
    
    if (result && result.success) {
      console.log('OutfitCreator: Friend outfit suggestion created successfully')
      showSuccess(`Outfit "${outfitName}" shared with @${friendProfile.value.username}! They will receive a notification.`)
      // Close the dialog
      showShareOutfitDialog.value = false
      // Navigate back to outfits gallery
      router.push('/outfits')
    } else {
      throw new Error('Failed to create friend outfit suggestion')
    }
  } catch (error) {
    console.error('OutfitCreator: Error sharing outfit with friend:', error)
    showError('Failed to share outfit. Please try again.')
    throw error
  }
}

const addOutfit = () => {
  // Function will be implemented later
  console.log('Add Outfit button clicked - function to be implemented')
}

// ============================================
// Virtual Try-On Functions
// ============================================

/**
 * Show virtual try-on modal and generate image
 */
const showVirtualTryOn = async () => {
  try {
    console.log('🎨 OutfitCreator: Showing virtual try-on...')
    
    // Validate that we have top and bottom
    if (!canShowVirtualTryOn.value) {
      showWarning('Please add at least one top and one bottom to your outfit before showing on model.')
      return
    }
    
    // If we already have a result and items match, just reopen the modal
    if (virtualTryOnImageUrl.value && !generatingTryOn.value && virtualTryOnMatchesCanvas.value) {
      console.log('🎨 OutfitCreator: Reopening modal with existing result')
      showVirtualTryOnModal.value = true
      return
    }
    
    // If generation is in progress, just reopen the modal to show progress
    if (generatingTryOn.value) {
      console.log('🎨 OutfitCreator: Reopening modal during generation')
      showVirtualTryOnModal.value = true
      return
    }
    
    // If items don't match or no result exists, generate new try-on
    if (virtualTryOnImageUrl.value && !virtualTryOnMatchesCanvas.value) {
      console.log('🎨 OutfitCreator: Canvas items changed, generating new try-on')
      virtualTryOnImageUrl.value = null
      virtualTryOnItemIds.value = null
      virtualTryOnError.value = null
    }
    
    // Clear any previous errors
    virtualTryOnError.value = null
    
    // Open modal immediately to show loading animation
    showVirtualTryOnModal.value = true
    generatingTryOn.value = true
    
    // Get top and bottom items from canvas
    const topItem = canvasItems.value.find(item => {
      const category = item.category?.toLowerCase()
      return category === 'tops' || category === 'top' || category === 't-shirt' || 
             category === 'shirt' || category === 'blouse' || category === 'hoodie' || 
             category === 'longsleeve' || category === 'polo' || category === 'body' || 
             category === 'undershirt' || category === 'outerwear' || category === 'blazer'
    })
    
    const bottomItem = canvasItems.value.find(item => {
      const category = item.category?.toLowerCase()
      return category === 'bottoms' || category === 'bottom' || category === 'pants' || 
             category === 'shorts' || category === 'skirt'
    })
    
    if (!topItem || !bottomItem) {
      throw new Error('Unable to find top and bottom items')
    }
    
    console.log('🎨 OutfitCreator: Top item:', topItem.name)
    console.log('🎨 OutfitCreator: Bottom item:', bottomItem.name)
    
    // Generate AI descriptions for top and bottom items using Llama-4-Scout
    const topImageUrl = topItem.image_url || topItem.thumbnail_url
    const bottomImageUrl = bottomItem.image_url || bottomItem.thumbnail_url
    
    // Generate description for top item
    console.log('🤖 OutfitCreator: Generating AI description for top item...')
    try {
      const topDescriptionResult = await llamaDescriptionService.generateDescription(
        topImageUrl,
        'tops'
      )
      
      if (topDescriptionResult.success && topDescriptionResult.description) {
        console.log('✅ OutfitCreator: Top item AI description generated successfully')
        console.log('📋 OutfitCreator: Top item description (JSON):', JSON.stringify(topDescriptionResult.description, null, 2))
      } else {
        console.warn('⚠️ OutfitCreator: Top item description generation returned no data')
      }
    } catch (topError) {
      console.warn('⚠️ OutfitCreator: Failed to generate top item description:', topError.message)
      // Continue with try-on even if description fails
    }
    
    // Generate description for bottom item
    console.log('🤖 OutfitCreator: Generating AI description for bottom item...')
    try {
      const bottomDescriptionResult = await llamaDescriptionService.generateDescription(
        bottomImageUrl,
        'bottoms'
      )
      
      if (bottomDescriptionResult.success && bottomDescriptionResult.description) {
        console.log('✅ OutfitCreator: Bottom item AI description generated successfully')
        console.log('📋 OutfitCreator: Bottom item description (JSON):', JSON.stringify(bottomDescriptionResult.description, null, 2))
      } else {
        console.warn('⚠️ OutfitCreator: Bottom item description generation returned no data')
      }
    } catch (bottomError) {
      console.warn('⚠️ OutfitCreator: Failed to generate bottom item description:', bottomError.message)
      // Continue with try-on even if description fails
    }
    
    // Generate virtual try-on
    const result = await virtualTryOnService.generateTryOn({
      topImageUrl: topImageUrl,
      bottomImageUrl: bottomImageUrl
    })
    
    if (result.success) {
      virtualTryOnImageUrl.value = result.imageUrl
      // Store the item IDs used for this generation
      virtualTryOnItemIds.value = {
        topId: topItem.originalId || topItem.id,
        bottomId: bottomItem.originalId || bottomItem.id
      }
      showSuccess('Virtual try-on generated successfully!')
      console.log('✅ OutfitCreator: Virtual try-on generated')
    } else {
      virtualTryOnError.value = result.error || 'Failed to generate virtual try-on'
      virtualTryOnItemIds.value = null // Clear IDs on error
      // Error will be shown in the modal, no need for separate pop-up
      console.error('❌ OutfitCreator: Virtual try-on failed:', result.error)
    }
    
  } catch (error) {
    console.error('❌ OutfitCreator: Error showing virtual try-on:', error)
    virtualTryOnError.value = error.message || 'An unexpected error occurred'
    // Error will be shown in the modal, no need for separate pop-up
  } finally {
    generatingTryOn.value = false
  }
}

/**
 * Close virtual try-on modal
 */
const closeVirtualTryOnModal = () => {
  showVirtualTryOnModal.value = false
  // Don't clear the image immediately - let it stay for next open
  // virtualTryOnImageUrl.value = null
  // virtualTryOnError.value = null
}

/**
 * Retry virtual try-on generation
 */
const retryVirtualTryOn = async () => {
  console.log('🔄 OutfitCreator: Retrying virtual try-on...')
  await showVirtualTryOn()
}

const saveToHistory = () => {
  const currentState = JSON.parse(JSON.stringify(canvasItems.value))
  history.value = history.value.slice(0, historyIndex.value + 1)
  history.value.push(currentState)
  historyIndex.value = history.value.length - 1
  
  // Limit history size
  if (history.value.length > 50) {
    history.value.shift()
    historyIndex.value--
  }
}

const undoAction = () => {
  if (canUndo.value) {
    historyIndex.value--
    canvasItems.value = JSON.parse(JSON.stringify(history.value[historyIndex.value]))
  }
}

const redoAction = () => {
  if (canRedo.value) {
    historyIndex.value++
    canvasItems.value = JSON.parse(JSON.stringify(history.value[historyIndex.value]))
  }
}

// Move item with arrow keys
const moveItemWithArrows = (direction, amount = 10) => {
  if (!selectedItemId.value) return
  
  const item = canvasItems.value.find(i => i.id === selectedItemId.value)
  if (!item) return
  
  const itemSize = 128
  
  switch (direction) {
    case 'ArrowLeft':
      item.x = Math.max(0, item.x - amount)
      break
    case 'ArrowRight':
      item.x = Math.min(canvasContainer.value?.clientWidth - itemSize || 400, item.x + amount)
      break
    case 'ArrowUp':
      item.y = Math.max(0, item.y - amount)
      break
    case 'ArrowDown':
      item.y = Math.min(canvasContainer.value?.clientHeight - itemSize || 300, item.y + amount)
      break
  }
  
  saveToHistory()
}

// Handle keyboard events
const handleKeydown = (event) => {
  // Don't handle keyboard events if user is typing in an input or textarea
  if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
    return
  }
  
  // Handle Esc key - prioritize closing modals
  if (event.key === 'Escape' || event.key === 'Esc') {
    event.preventDefault()
    event.stopPropagation()
    
    // Close weather recommendations modal if open (check first since it's more specific)
    if (showWeatherRecommendationsModal.value) {
      showWeatherRecommendationsModal.value = false
      return
    }
    
    // Close recommendations modal if open
    if (showRecommendationsModal.value) {
      showRecommendationsModal.value = false
      return
    }
    
    // Otherwise deselect item
    deselectItem()
    return
  }
  
  // Handle arrow keys to move selected item
  if (event.key.startsWith('Arrow')) {
    event.preventDefault()
    moveItemWithArrows(event.key, event.shiftKey ? 50 : 10) // Shift + Arrow = move 50px
    return
  }
  
  // Handle Delete key to delete selected item
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault()
    if (selectedItemId.value) {
      deleteSelectedItem()
    }
    return
  }
}

// Watch for route changes and update items source
watch(currentSubRoute, async (newRoute, oldRoute) => {
  console.log('OutfitCreator: Route changed from', oldRoute, 'to', newRoute)
  
  // Clear canvas when switching tabs (blank slate for new tab)
  canvasItems.value = []
  selectedItemId.value = null
  
  // Clear virtual try-on state when switching tabs (items don't match anymore)
  virtualTryOnImageUrl.value = null
  virtualTryOnItemIds.value = null
  
  // Clear friend profile when navigating away from friend routes
  if (newRoute !== 'friend' && newRoute !== 'friendSelect') {
    friendProfile.value = null
  }
  
  // Re-initialize items source
  initializeItemsSource()
  
  // If friend selection route, load friends list
  if (newRoute === 'friendSelect') {
    await loadFriendsList()
    return // Don't load wardrobe items on friend selection page
  }
  
  // If friend route with username, load friend profile first
  if (newRoute === 'friend' && friendUsername.value) {
    await loadFriendProfile(friendUsername.value)
  }
  
  // Reload wardrobe items for the new route
  await loadWardrobeItems()
  
  // Handle different sub-routes
  if (newRoute === 'suggested') {
    // AI Suggestions mode: Generate AI outfit
    await generateAISuggestion()
  }
})

// Lifecycle
onMounted(async () => {
  try {
    // Initialize desktop detection
    isDesktop.value = window.innerWidth >= 1024
    window.addEventListener('resize', handleResize)
    
    console.log('🎨 OutfitCreator: Component mounting...')
    console.log('🎨 Current route:', route.path)
    console.log('🎨 Current sub-route:', currentSubRoute.value)
    
    // Ensure auth store is initialized
    if (!authStore.isAuthenticated) {
      console.log('🔐 OutfitCreator: Initializing auth...')
      await authStore.initializeAuth()
    }
    
    // If we have a user but no profile, fetch the profile
    if (authStore.user && !authStore.profile) {
      console.log('👤 OutfitCreator: Fetching user profile...')
      await authStore.fetchUserProfile()
    }
    
    // Check if user is authenticated
    if (!authStore.user || !authStore.user.id) {
      console.warn('⚠️ OutfitCreator: User not authenticated, redirecting to login')
      router.push('/login')
      return
    }
    
    // Initialize items source based on route
    initializeItemsSource()
    
    // If friend selection route, load friends list
    if (currentSubRoute.value === 'friendSelect') {
      console.log('👥 OutfitCreator: Loading friends list...')
      await loadFriendsList()
      return // Don't load wardrobe items on friend selection page
    }
    
    // If friend route with username, load friend profile first
    if (currentSubRoute.value === 'friend' && friendUsername.value) {
      console.log('👥 OutfitCreator: Loading friend profile:', friendUsername.value)
      await loadFriendProfile(friendUsername.value)
    }
    
    // Load wardrobe items (will load friend's items if in friend mode)
    console.log('👕 OutfitCreator: Loading wardrobe items...')
    await loadWardrobeItems()
    
    // Handle different sub-routes
    if (currentSubRoute.value === 'edit' && route.params.outfitId) {
      // Edit mode: Load existing outfit
      console.log('✏️ OutfitCreator: Loading existing outfit:', route.params.outfitId)
      await loadExistingOutfit(route.params.outfitId)
    } else if (currentSubRoute.value === 'suggested') {
      // AI Suggestions mode: Generate AI outfit
      console.log('✨ OutfitCreator: Generating AI suggestion...')
      await generateAISuggestion()
    } else {
      // Personal/friend/other modes: Start with empty canvas
      console.log('🎨 OutfitCreator: Initializing empty canvas...')
      saveToHistory() // Initialize history
    }
    
    console.log('✅ OutfitCreator: Component mounted successfully')
  } catch (error) {
    console.error('❌ OutfitCreator: Error during mount:', error)
    console.error('❌ Error stack:', error.stack)
    // Show error to user
    showError(`Failed to load outfit creator: ${error.message}`)
    // Redirect to outfits page after a delay
    setTimeout(() => {
      router.push('/outfits')
    }, 2000)
  }

  // Setup keyboard event listener for arrow keys and Esc
  window.addEventListener('keydown', handleKeydown)
  
  // Setup click handler to close context menu
  window.addEventListener('click', closeContextMenu)

  // Register canvas items for keyboard navigation
  registerCanvasItems(canvasItems.value)

  // Setup keyboard event listeners
  const handleKeyboardEvent = (event) => {
    switch (event.type) {
      case 'keyboard-select-item':
        if (event.detail && event.detail.index >= 0) {
          selectedItemId.value = event.detail.item?.id || null
        }
        break
      
      case 'keyboard-move-item':
        if (event.detail && event.detail.index >= 0) {
          const item = canvasItems.value[event.detail.index]
          if (item) {
            const { direction, amount } = event.detail
            let newX = item.x
            let newY = item.y
            
            switch (direction) {
              case 'left':
                newX = Math.max(0, item.x - amount)
                break
              case 'right':
                newX = Math.min(400, item.x + amount) // Assuming canvas width
                break
              case 'up':
                newY = Math.max(0, item.y - amount)
                break
              case 'down':
                newY = Math.min(300, item.y + amount) // Assuming canvas height
                break
            }
            
            updateItemPosition(item.id, newX, newY)
          }
        }
        break
      
      case 'keyboard-save-outfit':
        saveOutfit()
        break
      
      case 'keyboard-undo':
        undoAction()
        break
      
      case 'keyboard-redo':
        redoAction()
        break
      
      case 'keyboard-clear-canvas':
        clearCanvas()
        break
      
      case 'keyboard-toggle-grid':
        toggleGrid()
        break
      
      case 'keyboard-toggle-selection':
        if (event.detail && event.detail.index >= 0) {
          const item = canvasItems.value[event.detail.index]
          if (item) {
            selectedItemId.value = selectedItemId.value === item.id ? null : item.id
          }
        }
        break
      
      case 'keyboard-remove-item':
        // Handle via selectedItemId if available, otherwise use index
        if (selectedItemId.value) {
          deleteSelectedItem()
        } else if (event.detail && event.detail.index >= 0) {
          const item = canvasItems.value[event.detail.index]
          if (item) {
            removeItemFromCanvas(item.id)
          }
        }
        break
    }
  }

  // Add event listeners
  window.addEventListener('keyboard-select-item', handleKeyboardEvent)
  window.addEventListener('keyboard-move-item', handleKeyboardEvent)
  window.addEventListener('keyboard-save-outfit', handleKeyboardEvent)
  window.addEventListener('keyboard-undo', handleKeyboardEvent)
  window.addEventListener('keyboard-redo', handleKeyboardEvent)
  window.addEventListener('keyboard-clear-canvas', handleKeyboardEvent)
  window.addEventListener('keyboard-toggle-grid', handleKeyboardEvent)
  window.addEventListener('keyboard-toggle-selection', handleKeyboardEvent)
  window.addEventListener('keyboard-remove-item', handleKeyboardEvent)

  // Cleanup on unmount
  onUnmounted(() => {
    // Clean up tooltip timeout
    if (tooltipTimeout.value) {
      clearTimeout(tooltipTimeout.value)
      tooltipTimeout.value = null
    }
    
    // Clean up any remaining touch event listeners
    document.removeEventListener('touchmove', handleTouchMove)
    document.removeEventListener('touchend', handleTouchEnd)
    document.removeEventListener('touchcancel', handleTouchEnd)
    
    // Remove arrow key and Esc handlers
    window.removeEventListener('keydown', handleKeydown)
    window.removeEventListener('resize', handleResize)
    window.removeEventListener('click', closeContextMenu)
    
    // Remove other keyboard event listeners
    window.removeEventListener('keyboard-select-item', handleKeyboardEvent)
    window.removeEventListener('keyboard-move-item', handleKeyboardEvent)
    window.removeEventListener('keyboard-save-outfit', handleKeyboardEvent)
    window.removeEventListener('keyboard-undo', handleKeyboardEvent)
    window.removeEventListener('keyboard-redo', handleKeyboardEvent)
    window.removeEventListener('keyboard-clear-canvas', handleKeyboardEvent)
    window.removeEventListener('keyboard-toggle-grid', handleKeyboardEvent)
    window.removeEventListener('keyboard-toggle-selection', handleKeyboardEvent)
    window.removeEventListener('keyboard-remove-item', handleKeyboardEvent)
  })
})

// Category filter - only show dynamic:
const categoryOptions = computed(() => {
  const cats = new Set(
    wardrobeItems.value
      .map(item => (item.category || '').toLowerCase())
      .filter(c => !!c)
  )
  return ['all', ...Array.from(cats)]
});

// Reset filter on route entry/change
onMounted(() => { activeCategory.value = 'all' })
watch(() => route.fullPath, () => { activeCategory.value = 'all' })
</script>