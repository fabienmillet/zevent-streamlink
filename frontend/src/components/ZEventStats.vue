<template>
  <section class="zevent-stats">
    <div class="container">
      <div class="stats-grid">
        <StatCard
          title="Streamers en ligne"
          :value="stats.streamersOnline"
          :subtitle="`sur ${stats.totalStreamers} streamers`"
          icon="users"
          :loading="loading"
          @click="fetchZEventData"
        />

        <StatCard
          title="Viewers total"
          :value="stats.totalViewers"
          subtitle="spectateurs connectés"
          icon="eye"
          :loading="loading"
        />

        <StatCard
          title="Donations totales"
          :value="stats.totalDonations"
          subtitle="euros collectés"
          icon="heart"
          :loading="loading"
        />

        <div class="top-streamer-card">
          <!-- Statut API au-dessus du top streamer -->
          <div class="api-status-wrapper">
            <StatusBadge />
          </div>
          
          <StatCard
            title="Top streamer"
            :value="stats.topStreamer.name"
            :subtitle="`${stats.topStreamer.viewers} viewers`"
            icon="star"
            :loading="loading"
          />
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import StatCard from './StatCard.vue'
import StatusBadge from './StatusBadge.vue'

// État réactif
const loading = ref(true)
const error = ref(false)
const lastUpdate = ref(null)
const rawData = ref([])

// Variables pour les timers
let updateInterval = null
let isPageVisible = true
const UPDATE_INTERVAL = 30000 // 30 secondes de base

// Adaptation dynamique selon l'activité de la page
const getAdaptiveInterval = () => {
  if (!isPageVisible) return 120000 // 2 minutes si page cachée
  if (document.hasFocus && !document.hasFocus()) return 60000 // 1 minute si pas de focus
  return UPDATE_INTERVAL // 30 secondes si actif
}

// Statistiques calculées
const stats = computed(() => {
  if (!rawData.value.length || !rawData.value[0]) {
    return {
      streamersOnline: 0,
      totalStreamers: 0,
      totalViewers: '0',
      totalDonations: 0,
      topStreamer: { name: 'N/A', viewers: '0' }
    }
  }

  // Les statistiques sont déjà calculées par l'API
  return rawData.value[0]
})

// Méthodes
const fetchZEventData = async () => {
  try {
    loading.value = true
    error.value = false

    // Utilise l'endpoint /api/zevent-stats qui retourne les statistiques calculées
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/zevent-stats`)
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.json()
    
    if (data && data.success && data.stats) {
      // Utilise directement les statistiques calculées par l'API
      rawData.value = [data.stats] // Encapsule dans un array pour compatibility
      lastUpdate.value = new Date()
    } else {
      throw new Error('Format de données invalide')
    }

  } catch (err) {
    console.error('Erreur lors de la récupération des données ZEvent:', err)
    error.value = true
  } finally {
    loading.value = false
  }
}

const startUpdateTimer = () => {
  // Première récupération immédiate
  fetchZEventData()
  
  // Gestion de la visibilité de la page
  const handleVisibilityChange = () => {
    isPageVisible = !document.hidden
    
    // Redémarrer le timer avec le bon intervalle
    if (updateInterval) {
      clearInterval(updateInterval)
      updateInterval = setInterval(fetchZEventData, getAdaptiveInterval())
    }
  }
  
  // Écouteurs d'événements
  document.addEventListener('visibilitychange', handleVisibilityChange)
  window.addEventListener('focus', handleVisibilityChange)
  window.addEventListener('blur', handleVisibilityChange)
  
  // Timer initial
  updateInterval = setInterval(fetchZEventData, getAdaptiveInterval())
}

const stopUpdateTimer = () => {
  if (updateInterval) {
    clearInterval(updateInterval)
    updateInterval = null
  }
  
  // Nettoyer les event listeners
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  window.removeEventListener('focus', handleVisibilityChange)
  window.removeEventListener('blur', handleVisibilityChange)
}

// Lifecycle
onMounted(() => {
  startUpdateTimer()
})

onUnmounted(() => {
  stopUpdateTimer()
})
</script>

<style lang="scss" scoped>
.zevent-stats {
  margin: 2rem 0;
  padding: 0 1rem;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
}

.stats-header {
  text-align: center;
  margin-bottom: 2rem;
}

.stats-title {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  
  &__icon {
    font-size: 1.5rem;
    animation: pulse 2s infinite;
  }
}

.stats-last-update {
  font-size: 0.875rem;
  color: var(--text-muted);
  font-weight: 500;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
}

.top-streamer-card {
  position: relative;
}

.api-status-wrapper {
  position: absolute;
  top: -3rem;
  right: 0;
  z-index: 10;
}

// Animations
@keyframes pulse {
  0% { 
    opacity: 1;
    transform: scale(1);
  }
  50% { 
    opacity: 0.7;
    transform: scale(1.05);
  }
  100% { 
    opacity: 1;
    transform: scale(1);
  }
}

// Responsive
@media (max-width: 768px) {
  .zevent-stats {
    margin: 1rem 0;
    padding: 0 0.5rem;
  }
  
  .stats-grid {
    grid-template-columns: 1fr;
    gap: 1rem;
  }
  
  .top-streamer-card {
    order: 1;
  }
  
  .api-status-wrapper {
    position: fixed;
    top: 1rem;
    right: 1rem;
    z-index: 1000;
  }
}

@media (max-width: 640px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .top-streamer-card {
    grid-column: 1 / -1;
  }
}

@media (max-width: 480px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }
}
</style>
