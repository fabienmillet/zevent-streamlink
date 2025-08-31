<template>
  <div id="app">
    <AppHeader
      :best-quality="bestQualityStream?.quality"
      :active-count="activeStreams.length"
      :total-count="totalStreams"
      :loading="loading"
    />

    <main class="main-content">
      <ZEventStats />
      
      <div class="container">
        <div class="error-notification" v-if="error">
          <div class="error-content">
            <span class="error-icon">⚠️</span>
            <span class="error-message">{{ error }}</span>
            <button class="error-close" @click="clearError">❌</button>
          </div>
        </div>

        <section class="add-stream-section">
          <StreamForm 
            :loading="loading"
            @submit="handleAddStream"
          />
        </section>

        <section class="streams-section">
          <div class="section-header">
            <h2 class="section-title">
              Flux actifs
              <span class="stream-count">({{ activeStreams.length }})</span>
            </h2>
            <button 
              class="refresh-btn"
              @click="refreshStreams"
              :disabled="loading"
              title="Actualiser"
            >
              ↻
            </button>
          </div>

          <div class="streams-grid" v-if="streams.length > 0">
            <StreamerCard
              v-for="stream in streams"
              :key="stream.id"
              :stream="stream"
              :loading="loading"
              :zevent-streamers="zeventStreamers"
              @start="handleStartStream"
              @stop="handleStopStream"
              @delete="handleDeleteStream"
              class="fade-in"
            />
          </div>

          <div class="empty-state" v-else>
            <div class="empty-icon">🌌</div>
            <h3 class="empty-title">Aucun flux configuré</h3>
            <p class="empty-description">
              Ajoutez votre premier flux Twitch pour commencer le streaming
            </p>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import AppHeader from './components/AppHeader.vue'
import StreamerCard from './components/StreamerCard.vue'
import StreamForm from './components/StreamForm.vue'
import ZEventStats from './components/ZEventStats.vue'

const streams = ref([])
const zeventStreamers = ref([])
const loading = ref(false)
const error = ref(null)

const activeStreams = computed(() => streams.value.filter(s => s.isLive))
const totalStreams = computed(() => streams.value.length)
const bestQualityStream = computed(() => {
  const qualities = ['source', 'best', '1080p60', '1080p', '720p60', '720p', '480p', '360p', 'worst']
  for (const quality of qualities) {
    const stream = activeStreams.value.find(s => s.quality === quality)
    if (stream) return stream
  }
  return null
})

const fetchStreams = async () => {
  try {
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/streams`)
    const data = await response.json()
    if (data.success) {
      streams.value = data.streams || []
    }
  } catch (err) {
    console.error('Erreur fetch streams:', err)
    error.value = 'Erreur lors du chargement des flux'
  }
}

const fetchZEventStreamers = async () => {
  try {
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/zevent-streamers`)
    const data = await response.json()
    if (data.success && data.live) {
      zeventStreamers.value = data.live
    }
  } catch (err) {
    console.error('Erreur fetch ZEvent streamers:', err)
  }
}

const initializeData = async () => {
  loading.value = true
  try {
    await Promise.all([
      fetchStreams(),
      fetchZEventStreamers()
    ])
  } finally {
    loading.value = false
  }
}

const clearError = () => {
  error.value = null
}

const refreshStreams = async () => {
  await initializeData()
}

const handleAddStream = async (formData) => {
  try {
    loading.value = true
    error.value = null
    
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/streams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    })
    
    const data = await response.json()
    if (data.success) {
      await fetchStreams()
    } else {
      throw new Error(data.error || 'Erreur inconnue')
    }
  } catch (err) {
    error.value = err.message || 'Erreur lors de l\'ajout du flux'
  } finally {
    loading.value = false
  }
}

const handleStartStream = async (streamId) => {
  try {
    loading.value = true
    
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/streams/${streamId}`, {
      method: 'PUT'
    })
    
    const data = await response.json()
    
    if (!response.ok) {
      throw new Error(data.error || 'Erreur redémarrage flux')
    }
    
    console.log('Flux redémarré:', data.message)
    
    await fetchStreams()
    
  } catch (error) {
    console.error('Erreur démarrage flux:', error)
    alert(`Erreur redémarrage: ${error.message}`)
  } finally {
    loading.value = false
  }
}

const handleStopStream = async (streamId) => {
  try {
    loading.value = true
    
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/streams/${streamId}/stop`, {
      method: 'PATCH'
    })
    
    const data = await response.json()
    if (data.success) {
      await Promise.all([fetchStreams(), fetchZEventStreamers()])
    } else {
      throw new Error(data.error || 'Erreur inconnue')
    }
  } catch (err) {
    error.value = err.message || 'Erreur lors de l\'arrêt du flux'
  } finally {
    loading.value = false
  }
}

const handleDeleteStream = async (streamId) => {
  try {
    loading.value = true
    error.value = null
    
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/streams/${streamId}`, {
      method: 'DELETE'
    })
    
    const data = await response.json()
    
    if (response.ok && data.success) {
      if (data.message) {
        console.log(`[Suppression] ${data.message}`)
      }
      await new Promise(resolve => setTimeout(resolve, 1000))
      await Promise.all([fetchStreams(), fetchZEventStreamers()])
    } else {
      if (data.error && data.error.includes('seule scène')) {
        alert(`❌ ${data.error}\n\nSolution : Créez d'abord une autre scène dans OBS avant de supprimer ce stream.`)
      }
      throw new Error(data.error || `Erreur HTTP: ${response.status}`)
    }
  } catch (err) {
    console.error('Erreur suppression flux:', err)
    error.value = err.message || 'Erreur lors de la suppression du flux'
  } finally {
    loading.value = false
  }
}

let refreshInterval = null

const startAutoRefresh = () => {
  if (refreshInterval) return
  refreshInterval = setInterval(async () => {
    await Promise.all([fetchStreams(), fetchZEventStreamers()])
  }, 5000)
}

const stopAutoRefresh = () => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
    refreshInterval = null
  }
}

onMounted(() => {
  initializeData()
  startAutoRefresh()
})

onUnmounted(() => {
  stopAutoRefresh()
})
</script>

<style lang="scss" scoped>
.main-content {
  min-height: calc(100vh - 80px);
  padding: 2rem 0;
}

.container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 2rem;
}

.error-notification {
  margin-bottom: 2rem;
  animation: slideInFromRight 0.4s ease-out;

  .error-content {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem 1.5rem;
    background: rgba(255, 95, 95, 0.1);
    border: 1px solid var(--danger-red);
    border-radius: 0.75rem;
    color: var(--danger-red);

    .error-icon {
      font-size: 1.2rem;
    }

    .error-message {
      flex: 1;
      font-weight: 500;
    }

    .error-close {
      background: none;
      border: none;
      color: var(--danger-red);
      cursor: pointer;
      font-size: 0.9rem;
      opacity: 0.7;
      transition: opacity 0.3s ease;

      &:hover {
        opacity: 1;
      }
    }
  }
}

.add-stream-section {
  margin-bottom: 3rem;
}

.streams-section {
  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;

    .section-title {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--text-primary);
      display: flex;
      align-items: center;
      gap: 0.5rem;

      .stream-count {
        color: var(--primary-green);
        font-size: 1rem;
      }
    }

    .refresh-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 0.5rem;
      color: var(--text-secondary);
      cursor: pointer;
      transition: all 0.3s ease;

      &:hover:not(:disabled) {
        background: var(--border-color);
        color: var(--text-primary);
        transform: translateY(-1px);
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .refresh-icon {
        font-size: 1.1rem;
        transition: transform 0.3s ease;

        &.spinning {
          animation: spin 1s linear infinite;
        }
      }
    }
  }

  .streams-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
    gap: 1.5rem;
    
    @media (max-width: 768px) {
      grid-template-columns: 1fr;
      gap: 1rem;
    }
  }

  .empty-state {
    text-align: center;
    padding: 4rem 2rem;
    color: var(--text-secondary);

    .empty-icon {
      font-size: 4rem;
      margin-bottom: 1rem;
      opacity: 0.5;
    }

    .empty-title {
      font-size: 1.5rem;
      font-weight: 600;
      margin-bottom: 0.5rem;
      color: var(--text-primary);
    }

    .empty-description {
      font-size: 1rem;
      line-height: 1.6;
      max-width: 400px;
      margin: 0 auto;
    }
  }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@media (max-width: 1024px) {
  .container {
    padding: 0 1.5rem;
  }
}

@media (max-width: 768px) {
  .main-content {
    padding: 1.5rem 0;
  }

  .container {
    padding: 0 1rem;
  }

  .streams-section .section-header {
    flex-direction: column;
    gap: 1rem;
    align-items: stretch;
  }
}
</style>
