<template>
  <div class="status-badge" :class="{ 'status-badge--offline': !isOnline, 'status-badge--loading': loading }">
    <div class="status-badge__indicator" :class="{ 'status-badge__indicator--offline': !isOnline }"></div>
    <span class="status-badge__text">
      {{ loading ? 'Vérification...' : (isOnline ? 'API Online' : 'API Offline') }}
    </span>
    <div class="status-badge__last-check" v-if="lastCheck && !loading">
      {{ formatTime(lastCheck) }}
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

// État réactif
const isOnline = ref(false)
const loading = ref(true)
const lastCheck = ref(null)

// Variables pour les timers
let checkInterval = null
const CHECK_INTERVAL = 60000 // 60 secondes au lieu de 10

// Méthodes
const checkApiStatus = async () => {
  try {
    loading.value = true
    
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000) // Timeout 5s
    
    // API utilisant la variable d'environnement VITE_API_BASE_URL
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/zevent-stats`, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'Accept': 'application/json'
      }
    })
    
    clearTimeout(timeoutId)
    
    if (response.ok) {
      const data = await response.json()
      isOnline.value = data.success
    } else {
      isOnline.value = false
    }
    
    lastCheck.value = new Date()
    
  } catch (error) {
    console.warn('API Status check failed:', error.message)
    isOnline.value = false
    lastCheck.value = new Date()
  } finally {
    loading.value = false
  }
}

const formatTime = (date) => {
  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(date)
}

const startStatusCheck = () => {
  // Première vérification immédiate
  checkApiStatus()
  
  // Puis vérification périodique
  checkInterval = setInterval(checkApiStatus, CHECK_INTERVAL)
}

const stopStatusCheck = () => {
  if (checkInterval) {
    clearInterval(checkInterval)
    checkInterval = null
  }
}

// Lifecycle
onMounted(() => {
  startStatusCheck()
})

onUnmounted(() => {
  stopStatusCheck()
})
</script>

<style lang="scss" scoped>
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(0, 255, 178, 0.3);
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 500;
  transition: all 0.3s ease;
  backdrop-filter: blur(10px);
  
  &--offline {
    border-color: rgba(239, 68, 68, 0.3);
  }
  
  &--loading {
    border-color: rgba(255, 255, 255, 0.2);
  }
}

.status-badge__indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--zevent-green);
  box-shadow: 0 0 8px var(--zevent-green-glow);
  animation: pulse 2s infinite;
  
  &--offline {
    background: var(--danger-red);
    box-shadow: 0 0 8px rgba(239, 68, 68, 0.4);
  }
}

.status-badge__text {
  color: var(--text-primary);
  white-space: nowrap;
}

.status-badge__last-check {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-left: 0.25rem;
}

// Animation
@keyframes pulse {
  0% { 
    opacity: 1;
    transform: scale(1);
  }
  50% { 
    opacity: 0.7;
    transform: scale(1.1);
  }
  100% { 
    opacity: 1;
    transform: scale(1);
  }
}

// Responsive
@media (max-width: 768px) {
  .status-badge {
    font-size: 0.8rem;
    padding: 0.4rem 0.6rem;
  }
  
  .status-badge__last-check {
    display: none;
  }
}
</style>
