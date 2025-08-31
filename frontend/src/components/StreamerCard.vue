/* Badge ZEvent bien positionné, overlay absolu sur la carte */
.streamer-card {
  position: relative;
}
/* Badge ZEvent : plus visible, effet glow, plus grand */
.zevent-badge-absolute {
  position: absolute;
  top: 8px;
  right: 8px;
  background: linear-gradient(90deg, #00ffb2 0%, #00c3ff 100%);
  color: #111;
  font-weight: 900;
  font-size: 0.75rem;
  padding: 0.25rem 0.8rem;
  border-radius: 1rem;
  box-shadow: 0 0 16px 4px #00ffb299, 0 2px 12px #00c3ff44;
  letter-spacing: 1px;
  z-index: 30;
  border: 2px solid #00ffb2;
  pointer-events: none;
  line-height: 1.2;
  text-shadow: 0 0 8px #00ffb2, 0 0 2px #fff;
  filter: drop-shadow(0 0 8px #00ffb2);
  transition: transform 0.2s cubic-bezier(.4,2,.6,1), box-shadow 0.2s;
}
.zevent-badge-absolute:hover {
  transform: scale(1.08) rotate(-2deg);
  box-shadow: 0 0 32px 8px #00ffb2cc, 0 2px 16px #00c3ff66;
}
.zevent-badge-force {
  background: #fff;
  background-clip: padding-box;
  box-shadow: 0 0 32px 8px #00ffb2cc, 0 2px 16px #00c3ff66, 0 0 0 6px #fff;
  border: 3px solid #00ffb2;
}
.streamer-card.card-zevent {
  border: 2px solid #00ffb2;
  box-shadow: 0 0 0 2px #00ffb233;
}
<template>
  <div class="streamer-card" :class="cardClass">
  <!-- Badge ZEvent temporairement désactivé -->
  <!-- <span v-if="isZeventStreamer" class="zevent-badge">ZEvent</span> -->
    <!-- En-tête avec infos streamer et statut -->
    <div class="card-header">
      <div class="streamer-info">
        <!-- Photo de profil ZEvent si disponible -->
        <div class="avatar-container" v-if="zeventStreamer">
          <img 
            :src="zeventStreamer.profileUrl" 
            :alt="stream.name"
            class="streamer-avatar"
            @error="hideAvatar"
          >
        </div>
        
        <div class="info-text">
          <h3 class="streamer-name">
            {{ stream.name }}
            <div class="zevent-badge-container">
              <img v-if="true" 
                   src="/badge_zevent.png" 
                   class="zevent-heart-badge" 
                   alt="ZEvent 2025" />
              <div class="zevent-tooltip">ZEvent 2025</div>
            </div>
          </h3>
          <div class="quality-badge">{{ stream.quality }}</div>
          
          <!-- Stats ZEvent si disponible (don uniquement) -->
          <div class="zevent-stats" v-if="zeventStreamer">
            <span class="stat-donations">
              <DollarSign :size="14" class="stat-icon" />
              {{ zeventStreamer.donationAmount.formatted }}
            </span>
          </div>

          <!-- Nombre de viewers live Twitch -->
          <div v-if="twitchViewers !== null" class="live-viewers">
            <Eye :size="14" class="stat-icon" />
            {{ twitchViewers.toLocaleString() }} spectateur{{ twitchViewers > 1 ? 's' : '' }}
          </div>
        </div>
      </div>
      
      <!-- Statut avec indicateur visuel -->
      <div class="status-container">
        <div class="status-badge" :class="statusClass">
          <div class="status-icon">
            <component :is="statusIcon" :size="16" />
          </div>
          <span class="status-text">
            {{ statusText }}
          </span>
        </div>
      </div>
    </div>

    <!-- Heure de démarrage -->
    <div class="start-time" v-if="stream.startTime">
      <Clock :size="14" class="time-icon" />
      Démarré à {{ formatTime(stream.startTime) }}
    </div>

    <!-- Séparateur -->
    <div class="separator"></div>

    <!-- Bouton pour déplier les informations techniques -->
    <button class="technical-toggle" @click="showTechnicalInfo = !showTechnicalInfo">
      <span>Informations techniques</span>
      <ChevronDown :size="16" :class="{ 'rotated': showTechnicalInfo }" />
    </button>

    <!-- Informations techniques (dépliables) -->
    <div v-show="showTechnicalInfo" class="technical-info">
      <div class="info-row">
        <label>URL M3U8</label>
        <div class="url-container">
          <input 
            type="text" 
            class="url-input"
            :value="httpUrl || ''"
            readonly
          >
          <button class="copy-btn" @click="copyHttpUrl" title="Copier l'URL M3U8">
            <Copy :size="14" />
          </button>
          <a 
            :href="`/player.html?url=${encodeURIComponent(httpUrl)}&name=${encodeURIComponent(stream.name)}`"
            target="_blank"
            class="open-btn"
            title="Ouvrir le flux dans le lecteur"
            v-if="httpUrl"
          >
            <ExternalLink :size="14" />
          </a>
        </div>
      </div>
      
      <!-- Sélecteur de qualité -->
      <div class="info-row">
        <label>QUALITÉ</label>
        <div class="quality-container">
          <select 
            class="quality-select"
            :value="stream.quality"
            @change="handleQualityChange"
            :disabled="loading"
            title="Changer la qualité du flux"
          >
            <option value="1080p60">1080p 60fps</option>
            <option value="1080p">1080p</option>
            <option value="720p60">720p 60fps</option>
            <option value="720p">720p</option>
            <option value="480p">480p</option>
            <option value="360p">360p</option>
            <option value="best">Meilleure</option>
            <option value="worst">Pire</option>
          </select>
          <button 
            class="apply-btn" 
            @click="applyQuality"
            :disabled="loading || selectedQuality === stream.quality"
            title="Appliquer la nouvelle qualité"
            v-if="selectedQuality !== stream.quality"
          >
            ✓
          </button>
        </div>
      </div>
      
      <!-- Décodage matériel avec boutons -->
      <div class="info-row">
        <label>DÉCODAGE MATÉRIEL</label>
        <div class="hardware-buttons">
          <button 
            class="hw-btn" 
            :class="{ active: hardwareDecodingEnabled }"
            @click="toggleHardwareDecoding"
            :disabled="loading"
          >
            {{ hardwareDecodingEnabled ? 'ACTIVÉ' : 'DÉSACTIVÉ' }}
          </button>
        </div>
      </div>
      
      <!-- Affichage du chat avec boutons -->
      <div class="info-row">
        <label>CHAT TWITCH</label>
        <div class="hardware-buttons">
          <button 
            class="hw-btn" 
            :class="{ active: chatEnabled }"
            @click="toggleChatDisplay"
            :disabled="loading"
          >
            {{ chatEnabled ? 'ACTIVÉ' : 'DÉSACTIVÉ' }}
          </button>
        </div>
      </div>
      
      <!-- Actions de gestion -->
      <div class="info-row">
        <label>ACTIONS</label>
        <div class="action-container">
          <button 
            class="action-btn delete-btn"
            @click="handleDelete"
            :disabled="loading"
            :class="{ 'confirm-mode': showConfirm }"
            :title="showConfirm ? 'Cliquer à nouveau pour confirmer' : 'Supprimer le flux'"
          >
            <component :is="showConfirm ? AlertTriangle : Trash2" :size="16" />
            {{ showConfirm ? 'Confirmer ?' : 'Supprimer' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Statut des publicités -->
    <div class="ad-status" v-if="stream.adStatus === 'waiting' || adTimeRemaining > 0">
      <div class="ad-indicator">
        <div class="ad-icon">📺</div>
        <div class="ad-content">
          <div class="ad-title">Publicités en cours</div>
          <div class="ad-message">{{ stream.adMessage || 'En attente de la fin des publicités...' }}</div>
          <div class="ad-timer" v-if="adTimeRemaining > 0">
            ⏱️ {{ adTimeRemaining }} seconde{{ adTimeRemaining > 1 ? 's' : '' }} restante{{ adTimeRemaining > 1 ? 's' : '' }}
          </div>
          <div class="ad-timer" v-else-if="stream.adTimer">
            ⏱️ {{ stream.adTimer }} secondes restantes
          </div>
        </div>
      </div>
    </div>

    <!-- Notification temporaire -->
    <div class="notification-overlay" v-if="showNotificationAlert">
      <div class="notification-content">
        {{ notification }}
      </div>
    </div>


  </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { 
  Trash2, 
  Copy, 
  ExternalLink, 
  Zap, 
  Eye, 
  DollarSign, 
  AlertTriangle,
  CheckCircle,
  XCircle,
  AlertCircle,
  Circle,
  Clock,
  RefreshCw,
  ChevronDown
} from 'lucide-vue-next'

const props = defineProps({
  stream: {
    type: Object,
    required: true
  },
  loading: {
    type: Boolean,
    default: false
  },
  zeventStreamers: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['start', 'stop', 'delete'])

// État local
const showConfirm = ref(false)
const showAvatar = ref(true)
const selectedQuality = ref(props.stream.quality)
const showTechnicalInfo = ref(false)
const adTimeRemaining = ref(0)
const notification = ref('')
const showNotificationAlert = ref(false)
let confirmTimeout = null
let ws = null
let notificationTimeout = null

// --- Ajout viewers live Twitch ---
const twitchViewers = ref(null)

// Synchroniser selectedQuality quand la qualité du stream change (fallbacks, etc.)
watch(() => props.stream.quality, (newQuality) => {
  selectedQuality.value = newQuality
})

// Streamer ZEvent correspondant
const zeventStreamer = computed(() => {
  if (!props.zeventStreamers.length) return null
  
  const streamerName = extractStreamerName(props.stream.twitchUrl)
  const cleanName = streamerName.replace('@', '').toLowerCase()
  
  return props.zeventStreamers.find(streamer => 
    streamer.twitch.toLowerCase() === cleanName ||
    streamer.display.toLowerCase() === cleanName
  )
})

// Vérifie si c'est un streamer ZEvent
const isZeventStreamer = computed(() => {
  console.log('DEBUG - Stream data:', props.stream.name, props.stream)
  // Utilise d'abord la propriété du stream (backend)
  if (props.stream.isZEventStreamer !== undefined) {
    console.log('Stream ZEvent status (backend):', props.stream.name, props.stream.isZEventStreamer)
    return Boolean(props.stream.isZEventStreamer)
  }
  // Fallback sur la recherche dans la liste ZEvent
  const fallback = Boolean(zeventStreamer.value)
  console.log('Fallback ZEvent status:', props.stream.name, fallback)
  return fallback
})

// État du flux
const isActive = computed(() => props.stream.status === 'running')

// Classes CSS dynamiques
const cardClass = computed(() => {
  if (twitchOnline.value === true) return 'card-twitch-online';
  if (twitchOnline.value === false) return 'card-twitch-offline'; // Nouvelle classe pour streamers hors ligne
  return {
    'card-active': isActive.value,
    'card-error': props.stream.status === 'error',
    'card-stopped': props.stream.status === 'stopped',
    'card-zevent': !!zeventStreamer.value
  };
});

const statusClass = computed(() => {
  if (twitchOnline.value === true) return 'status-twitch-online';
  if (twitchOnline.value === false) return 'status-twitch-offline';
  if (isActive.value) return 'status-active';
  if (props.stream.status === 'stopped') return 'status-stopped';
  if (props.stream.status === 'error') return 'status-error';
  if (['auto-restarting', 'temporary_failure', 'restarting'].includes(props.stream.status)) return 'status-restarting';
  return '';
});


// --- Statut online/offline Twitch (polling REST) ---
const twitchOnline = ref(null) // null = inconnu, true = online, false = offline
const hardwareDecodingEnabled = ref(false) // État du décodage matériel
const chatEnabled = ref(false) // État du chat
let statusInterval = null

const fetchTwitchStatus = async () => {
  if (!props.stream || !props.stream.name) return
  try {
    const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/streams`)
    const data = await res.json()
    if (data && data.success && data.streams) {
      // Chercher le stream correspondant dans la liste
      const currentStream = data.streams.find(s => s.name === props.stream.name)
      if (currentStream) {
        // Utiliser les propriétés correctes de l'API
        twitchOnline.value = !!currentStream.isLive
        twitchViewers.value = typeof currentStream.twitchViewers === 'number' ? currentStream.twitchViewers : null
        
        // Mettre à jour les états OBS
        if (typeof currentStream.hardwareDecoding === 'boolean') {
          hardwareDecodingEnabled.value = currentStream.hardwareDecoding
        }
        if (typeof currentStream.chatEnabled === 'boolean') {
          chatEnabled.value = currentStream.chatEnabled
        }
      } else {
        twitchOnline.value = null
        twitchViewers.value = null
      }
    } else {
      twitchOnline.value = null
      twitchViewers.value = null
    }
  } catch (e) {
    twitchOnline.value = null
    twitchViewers.value = null
  }
}

onMounted(() => {
  fetchTwitchStatus()
  statusInterval = setInterval(fetchTwitchStatus, 30000) // toutes les 30s
  
  // Récupérer l'état initial du décodage matériel et du chat
  fetchHardwareDecodingStatus()
  fetchChatStatus()
})
onUnmounted(() => {
  if (statusInterval) clearInterval(statusInterval)
})

const statusText = computed(() => {
  if (twitchOnline.value === true) return 'En ligne'
  if (twitchOnline.value === false) return 'Hors ligne'
  // fallback sur l’ancien statut si inconnu
  switch (props.stream.status) {
    case 'running': return isZeventStreamer.value ? 'ZEvent Live' : 'Actif'
    case 'stopped': return isZeventStreamer.value ? 'Streamer ZEvent' : 'Arrêté'
    case 'error': return props.stream.errorMessage || 'Erreur de connexion'
    case 'auto-restarting': return 'Relance auto...'
    case 'temporary_failure': return 'Pub détectée - relance...'
    case 'restarting': return 'Redémarrage...'
    case 'starting': return 'Démarrage...'
    default: return 'Inconnu'
  }
})

const statusIcon = computed(() => {
  if (twitchOnline.value === true) return CheckCircle
  if (twitchOnline.value === false) return XCircle
  switch (props.stream.status) {
    case 'running': return CheckCircle
    case 'stopped': return XCircle
    case 'error': return AlertCircle
    case 'auto-restarting':
    case 'temporary_failure':
    case 'restarting':
    case 'starting':
      return RefreshCw
    default: return Circle
  }
})

// URL HTTP générée à partir du port ou directement depuis l'API
const httpUrl = computed(() => {
  // Si c'est un stream avec protocol SRT et port, générer l'URL HTTP
  if (props.stream.protocol === 'srt' && props.stream.port) {
    const httpPort = props.stream.httpPort || (props.stream.port + 1000)
    return `http://${window.location.hostname}:${httpPort}`
  }
  // Sinon utiliser l'URL M3U8 directement depuis l'API
  return props.stream.m3u8Url || props.stream.httpUrl || null
})

// ... WebSocket logic removed ...

// Méthodes
const extractStreamerName = (url) => {
  try {
    const match = url.match(/twitch\.tv\/(.+)/)
    return match ? `@${match[1]}` : url
  } catch {
    return url
  }
}

const formatTime = (dateString) => {
  try {
    // Le backend renvoie le format "17/08/2025 22:35:20"
    // Convertir vers un format que Date peut comprendre
    if (dateString.includes('/')) {
      const [datePart, timePart] = dateString.split(' ')
      const [day, month, year] = datePart.split('/')
      const isoString = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${timePart}`
      const date = new Date(isoString)
      return date.toLocaleTimeString('fr-FR', { 
        hour: '2-digit', 
        minute: '2-digit' 
      })
    } else {
      // Format ISO standard
      const date = new Date(dateString)
      return date.toLocaleTimeString('fr-FR', { 
        hour: '2-digit', 
        minute: '2-digit' 
      })
    }
  } catch (error) {
    console.error('Erreur formatage date:', error, dateString)
    return 'Erreur date'
  }
}

const hideAvatar = () => {
  showAvatar.value = false
}

// Actions de copie
const copyPort = async () => {
  try {
    await navigator.clipboard.writeText(props.stream.port.toString())
    showNotification('Port copié !')
  } catch (err) {
    console.error('Erreur copie port:', err)
  }
}

const copyHttpPort = async () => {
  try {
    const httpPort = props.stream.httpPort || (props.stream.port + 1000)
    await navigator.clipboard.writeText(httpPort.toString())
    showNotification('Port HTTP copié !')
  } catch (err) {
    console.error('Erreur copie port HTTP:', err)
  }
}

const copyUrl = async () => {
  try {
    await navigator.clipboard.writeText(props.stream.localUrl)
    showNotification('URL copiée !')
  } catch (err) {
    console.error('Erreur copie URL:', err)
  }
}

const copyHttpUrl = async () => {
  try {
    await navigator.clipboard.writeText(httpUrl.value)
    showNotification('URL HTTP copiée !')
  } catch (err) {
    console.error('Erreur copie URL HTTP:', err)
  }
}

// Actions principales

const handleDelete = async () => {
  if (showConfirm.value) {
    // Confirmer la suppression
    try {
      emit('delete', props.stream.id)
      showConfirm.value = false
      showNotification(`Suppression de ${props.stream.name}...`)
    } catch (error) {
      console.error('Erreur suppression:', error)
      showNotification('Erreur lors de la suppression')
    }
  } else {
    // Première pression : demander confirmation
    showConfirm.value = true
    
    // Auto-annulation après 3 secondes
    confirmTimeout = setTimeout(() => {
      showConfirm.value = false
    }, 3000)
  }
}

// Gestion de la qualité
const handleQualityChange = (event) => {
  selectedQuality.value = event.target.value
}

const applyQuality = async () => {
  if (props.loading) return
  
  try {
    showNotification(`Changement de qualité vers ${selectedQuality.value}...`)
    
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/streams/${props.stream.id}/quality`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        quality: selectedQuality.value
      })
    })

    // Vérifier d'abord si la réponse est ok
    if (!response.ok) {
      throw new Error(`Erreur HTTP: ${response.status} ${response.statusText}`)
    }

    // Vérifier si la réponse a du contenu
    const responseText = await response.text()
    if (!responseText.trim()) {
      throw new Error('Réponse vide du serveur')
    }

    // Parser le JSON
    let result
    try {
      result = JSON.parse(responseText)
    } catch (parseError) {
      console.error('Erreur parse JSON:', parseError)
      console.error('Contenu de la réponse:', responseText)
      throw new Error('Réponse serveur malformée')
    }
    
    if (result.success) {
      showNotification(`✅ Qualité changée vers ${selectedQuality.value}`)
      if (result.restarted) {
        showNotification(`🔄 Flux redémarré avec la nouvelle qualité`)
      }
      // La qualité sera mise à jour via le polling automatique
    } else {
      showNotification(`❌ Erreur: ${result.error || 'Erreur inconnue'}`)
      // Remettre la qualité précédente en cas d'erreur
      selectedQuality.value = props.stream.quality
    }
  } catch (error) {
    console.error('Erreur changement qualité:', error)
    let errorMessage = 'Erreur lors du changement de qualité'
    
    if (error.message.includes('Failed to fetch')) {
      errorMessage = 'Impossible de contacter le serveur'
    } else if (error.message.includes('JSON')) {
      errorMessage = 'Erreur de communication avec le serveur'
    } else if (error.message.includes('404')) {
      errorMessage = 'Serveur non disponible (404)'
    } else if (error.message) {
      errorMessage = error.message
    }
    
    showNotification(`❌ ${errorMessage}`)
    // Remettre la qualité précédente en cas d'erreur
    selectedQuality.value = props.stream.quality
  }
}

// Récupérer l'état du décodage matériel depuis GET /api/streams
const fetchHardwareDecodingStatus = async () => {
  if (!props.stream || !props.stream.id) return
  
  // D'abord, vérifier si on a déjà la propriété dans le stream
  if (typeof props.stream.hardwareDecoding === 'boolean') {
    hardwareDecodingEnabled.value = props.stream.hardwareDecoding
    return
  }
  
  try {
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/streams`)
    if (response.ok) {
      const result = await response.json()
      if (result.success && result.streams) {
        // Chercher le stream correspondant dans la liste
        const currentStream = result.streams.find(s => s.id === props.stream.id)
        if (currentStream && typeof currentStream.hardwareDecoding === 'boolean') {
          hardwareDecodingEnabled.value = currentStream.hardwareDecoding
        }
      }
    }
  } catch (error) {
    // Silencieux - pas grave si on ne peut pas récupérer l'état
    console.debug('Could not fetch hardware decoding status:', error)
  }
}

const fetchChatStatus = async () => {
  if (!props.stream || !props.stream.id) return
  
  // D'abord, vérifier si on a déjà la propriété dans le stream
  if (typeof props.stream.chatEnabled === 'boolean') {
    chatEnabled.value = props.stream.chatEnabled
    return
  }
  
  try {
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/streams`)
    if (response.ok) {
      const result = await response.json()
      if (result.success && result.streams) {
        // Chercher le stream correspondant dans la liste
        const currentStream = result.streams.find(s => s.id === props.stream.id)
        if (currentStream && typeof currentStream.chatEnabled === 'boolean') {
          chatEnabled.value = currentStream.chatEnabled
        }
      }
    }
  } catch (error) {
    // Silencieux - pas grave si on ne peut pas récupérer l'état
    console.debug('Could not fetch chat status:', error)
  }
}

// Toggle décodage matériel OBS via PATCH /api/streams/{id}/hardware-decoding
const toggleHardwareDecoding = async () => {
  if (!props.stream || !props.stream.id) return
  
  try {
    const newState = !hardwareDecodingEnabled.value
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/streams/${props.stream.id}/hardware-decoding`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        enabled: newState
      })
    })

    if (!response.ok) {
      throw new Error(`Erreur HTTP: ${response.status}`)
    }

    const result = await response.json()
    if (result.success) {
      hardwareDecodingEnabled.value = newState
      showNotification(`✅ Décodage matériel ${newState ? 'activé' : 'désactivé'}`)
    } else {
      throw new Error(result.error || 'Erreur inconnue')
    }
  } catch (error) {
    console.error('Erreur toggle décodage matériel:', error)
    showNotification(`❌ Erreur: ${error.message}`)
  }
}

// Toggle chat display OBS via PATCH /api/streams/{id}/chat
const toggleChatDisplay = async () => {
  if (!props.stream || !props.stream.id) return
  
  try {
    const newState = !chatEnabled.value
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/streams/${props.stream.id}/chat`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        enabled: newState
      })
    })

    if (!response.ok) {
      throw new Error(`Erreur HTTP: ${response.status}`)
    }

    const result = await response.json()
    if (result.success) {
      chatEnabled.value = newState
      showNotification(`✅ Chat ${newState ? 'activé' : 'désactivé'}`)
    } else {
      throw new Error(result.error || 'Erreur inconnue')
    }
  } catch (error) {
    console.error('Erreur toggle chat:', error)
    showNotification(`❌ Erreur: ${error.message}`)
  }
}

// Notification améliorée
const showNotification = (message) => {
  notification.value = message
  showNotificationAlert.value = true
  
  // Auto-masquer après 3 secondes
  if (notificationTimeout) {
    clearTimeout(notificationTimeout)
  }
  
  notificationTimeout = setTimeout(() => {
    showNotificationAlert.value = false
    notification.value = ''
  }, 3000)
}

// Lifecycle
onMounted(() => {
  // ...existing code...
})

onUnmounted(() => {
  if (confirmTimeout) {
    clearTimeout(confirmTimeout)
  }
  if (notificationTimeout) {
    clearTimeout(notificationTimeout)
  }
  // ... WebSocket disconnect removed ...
})
</script>

<style lang="scss" scoped>
.streamer-card {
  position: relative;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 1rem;
  padding: 1.5rem;
  transition: all 0.3s ease;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: var(--border-color);
    transition: all 0.3s ease;
  }

  &.card-twitch-online {
    border-color: var(--primary-green);
    box-shadow: 0 4px 20px rgba(0, 255, 178, 0.15);
    &::before {
      background: var(--gradient-primary);
    }
  }

  &.card-active {
    border-color: var(--primary-green);
    box-shadow: 0 4px 20px rgba(0, 255, 178, 0.15);
    &::before {
      background: var(--gradient-primary);
    }
  }

  &.card-zevent {
    border-color: var(--primary-green);
    &::before {
      background: linear-gradient(90deg, var(--primary-green), #00d4aa);
    }
  }

  &.card-twitch-offline {
    border-color: #6b7280; /* Gris pour les streamers hors ligne */
    opacity: 0.7;
    &::before {
      background: #6b7280;
    }
  }

  &.card-error {
    border-color: var(--danger-red);
    animation: pulse-error 2s infinite;
    &::before {
      background: var(--danger-red);
    }
  }

  &.card-stopped {
    border-color: var(--danger-red);
    opacity: 0.7;
    &::before {
      background: var(--danger-red);
    }
  }

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
  }
}

.zevent-badge {
  position: absolute;
  top: 45px;
  right: 8px;
  background: linear-gradient(90deg, #00ffb2 0%, #00c3ff 100%);
  color: #111;
  padding: 0.25rem 0.8rem;
  border-radius: 1rem;
  font-size: 0.75rem;
  font-weight: 900;
  text-shadow: 0 0 8px #00ffb2, 0 0 2px #fff;
  border: 2px solid #00ffb2;
  box-shadow: 0 0 16px 4px #00ffb299;
  z-index: 30;
  animation: pulse 2s infinite;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1rem;
}

.streamer-info {
  display: flex;
  gap: 1rem;
  flex: 1;

  .avatar-container {
    .streamer-avatar {
      width: 50px;
      height: 50px;
      border-radius: 50%;
      border: 2px solid var(--primary-green);
      object-fit: cover;
    }
  }

  .info-text {
    flex: 1;

    .streamer-name {
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--text-primary);
      margin-bottom: 0.25rem;
      display: flex;
      align-items: center;
      gap: 0.25rem;
      
      .zevent-badge-container {
        position: relative;
        display: inline-block;
        
        .zevent-heart-badge {
          width: 28px;
          height: 28px;
          opacity: 0.9;
          transition: all 0.3s ease;
          cursor: help;
          transform: translateY(2px);
          
          &:hover {
            opacity: 1;
            transform: translateY(2px) scale(1.1);
            filter: brightness(1.1);
          }
        }
        
        .zevent-tooltip {
          position: absolute;
          top: 35px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(40, 40, 40, 0.95);
          color: white;
          padding: 0.5rem 0.75rem;
          border-radius: 0.375rem;
          font-size: 0.75rem;
          font-weight: 500;
          white-space: nowrap;
          z-index: 1000;
          pointer-events: none;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
          opacity: 0;
          visibility: hidden;
          transition: all 0.3s ease;
        }
        
        &:hover .zevent-tooltip {
          opacity: 1;
          visibility: visible;
        }
      }
    }

    .streamer-handle {
      color: var(--text-secondary);
      font-size: 0.9rem;
      margin-bottom: 0.25rem;
    }

    .quality-badge {
      display: inline-block;
      background: rgba(0, 255, 178, 0.15);
      color: var(--primary-green);
      padding: 0.2rem 0.5rem;
      border-radius: 0.3rem;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      margin-bottom: 0.5rem;
    }

    .zevent-stats {
      display: flex;
      gap: 0.75rem;
      font-size: 0.85rem;

      .stat-viewers,
      .stat-donations {
        display: flex;
        align-items: center;
        gap: 0.3rem;
        color: var(--text-secondary);
        font-weight: 500;
      }
    }

    .live-viewers {
      display: flex;
      align-items: center;
      gap: 0.3rem;
      color: var(--success-green);
      font-size: 0.95rem;
      font-weight: 600;
      margin-bottom: 0.2rem;
    }
  }
}

.status-container {
  .status-badge {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-radius: 0.5rem;
    font-size: 0.8rem;
    font-weight: 600;
    white-space: nowrap;

    &.status-active {
      background: rgba(34, 197, 94, 0.15);
      color: var(--success-green);
      border: 1px solid rgba(34, 197, 94, 0.3);
    }

    &.status-stopped {
      background: rgba(102, 102, 102, 0.15);
      color: var(--text-muted);
      border: 1px solid rgba(102, 102, 102, 0.3);
    }

    &.status-error {
      background: rgba(255, 95, 95, 0.15);
      color: var(--danger-red);
      border: 1px solid rgba(255, 95, 95, 0.3);
    }

    &.status-restarting {
      background: rgba(255, 165, 0, 0.15);
      color: #ff8c00;
      border: 1px solid rgba(255, 165, 0, 0.3);
    }

    .status-icon {
      animation: pulse 2s infinite;
    }
  }
}

.start-time {
  color: var(--text-muted);
  font-size: 0.85rem;
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;

  .stat-icon {
    color: var(--primary-green);
    margin-right: 0.25rem;
  }
}

.separator {
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--border-color), transparent);
  margin: 1rem 0;
}

.technical-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 0.9rem;
  font-weight: 600;
  padding: 0.75rem 0;
  cursor: pointer;
  transition: color 0.2s ease;
  
  &:hover {
    color: var(--text-primary);
  }
  
  svg {
    transition: transform 0.3s ease;
    
    &.rotated {
      transform: rotate(180deg);
    }
  }
}

.technical-info {
  margin-bottom: 1.5rem;

  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;

    &:last-child {
      margin-bottom: 0;
    }

    label {
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      min-width: 80px;
    }

    .value-container {
      display: flex;
      align-items: center;
      gap: 0.5rem;

      .port-value {
        font-family: 'Monaco', 'Menlo', monospace;
        font-size: 1rem;
        font-weight: 700;
        color: var(--primary-green);
        background: rgba(0, 255, 178, 0.1);
        padding: 0.3rem 0.6rem;
        border-radius: 0.3rem;
        border: 1px solid rgba(0, 255, 178, 0.2);
      }
    }

    .url-container {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex: 1;
      margin-left: 1rem;

      .url-input {
        flex: 1;
        padding: 0.4rem 0.6rem;
        background: var(--dark-bg);
        border: 1px solid var(--border-color);
        border-radius: 0.3rem;
        color: var(--text-primary);
        font-family: 'Monaco', 'Menlo', monospace;
        font-size: 0.8rem;

        &:focus {
          outline: none;
          border-color: var(--primary-green);
        }
      }
    }
  }
}

.status-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
}

.status-active .status-icon {
  color: var(--primary-green);
}

.status-stopped .status-icon {
  color: var(--danger-red);
}

.status-error .status-icon {
  color: var(--warning-orange);
}

.status-restarting .status-icon {
  color: #ff8c00;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.zevent-inline-icon {
  color: var(--primary-green);
  margin-right: 0.25rem;
}

.start-time {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  color: var(--text-secondary);
  font-size: 0.85rem;
  margin-top: 0.5rem;
  
  .time-icon {
    color: var(--primary-green);
  }
}

.copy-btn,
.open-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: var(--border-color);
  border: none;
  border-radius: 0.3rem;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.3s ease;
  text-decoration: none;
  font-size: 0.8rem;

  &:hover {
    background: var(--primary-green);
    color: white;
    transform: translateY(-1px);
  }
}

.quality-container {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  margin-left: 1rem;

  .quality-select {
    flex: 1;
    padding: 0.4rem 0.6rem;
    background: var(--dark-bg);
    border: 1px solid var(--border-color);
    border-radius: 0.3rem;
    color: var(--text-primary);
    font-size: 0.8rem;
    min-width: 120px;

    &:focus {
      outline: none;
      border-color: var(--primary-green);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  .apply-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: var(--primary-green);
    border: none;
    border-radius: 0.3rem;
    color: white;
    cursor: pointer;
    transition: all 0.3s ease;
    font-size: 0.9rem;
    font-weight: 600;

    &:hover:not(:disabled) {
      background: var(--primary-green-hover);
      transform: translateY(-1px);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }
  }
}

.action-container {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  margin-left: 1rem;

  .delete-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.6rem;
    background: var(--status-error);
    border: none;
    border-radius: 0.3rem;
    color: white;
    cursor: pointer;
    transition: all 0.3s ease;
    font-size: 0.8rem;
    font-weight: 500;

    &:hover:not(:disabled) {
      background: #dc2626;
      transform: translateY(-1px);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }

    &.confirm-mode {
      background: #dc2626;
      animation: pulse-warning 1s ease-in-out infinite;
    }
  }
}

@keyframes pulse-warning {
  0%, 100% { 
    transform: scale(1); 
    box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.7);
  }
  50% { 
    transform: scale(1.02); 
    box-shadow: 0 0 0 4px rgba(220, 38, 38, 0);
  }
}

.ad-status {
  margin: 0.75rem 0;
  padding: 0.75rem;
  background: linear-gradient(135deg, #fff3cd, #ffeaa7);
  border: 1px solid #ffc107;
  border-radius: 0.5rem;
  
  .ad-indicator {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  
  .ad-icon {
    font-size: 1.5rem;
    animation: pulse 2s infinite;
  }
  
  .ad-content {
    flex: 1;
  }
  
  .ad-title {
    font-weight: 600;
    color: #856404;
    font-size: 0.9rem;
    margin-bottom: 0.25rem;
  }
  
  .ad-message {
    color: #856404;
    font-size: 0.8rem;
    margin-bottom: 0.25rem;
  }
  
  .ad-timer {
    color: #dc3545;
    font-size: 0.8rem;
    font-weight: 600;
  }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.card-actions {
  display: flex;
  gap: 0.75rem;
  justify-content: center;
}

.action-btn {
  flex: 1;
  padding: 0.75rem 1rem;
  border: none;
  border-radius: 0.5rem;
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none !important;
  }

  &:hover:not(:disabled) {
    transform: translateY(-2px);
  }

  &.start-btn {
    background: var(--gradient-primary);
    color: white;
    border: 1px solid var(--primary-green-dark);

    &:hover:not(:disabled) {
      box-shadow: 0 4px 15px rgba(0, 255, 178, 0.3);
    }
  }

  &.stop-btn {
    background: var(--gradient-danger);
    color: white;
    border: 1px solid var(--danger-red-hover);

    &:hover:not(:disabled) {
      box-shadow: 0 4px 15px rgba(239, 68, 68, 0.3);
    }
  }

  &.delete-btn {
    background: var(--gradient-warning);
    color: white;
    border: 1px solid var(--warning-orange-hover);

    &:hover:not(:disabled) {
      box-shadow: 0 4px 15px rgba(245, 158, 11, 0.3);
    }

    &.confirm-mode {
      background: var(--gradient-danger);
      animation: pulse 1s infinite;
    }
  }
}

// Notification overlay
.notification-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  z-index: 1000;
  animation: fadeIn 0.2s ease-out;
  
  .notification-content {
    background: var(--background-secondary);
    color: var(--text-primary);
    padding: 1rem 1.5rem;
    border-radius: 8px;
    font-weight: 500;
    text-align: center;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    border: 1px solid var(--border-light);
  }
}

// Boutons décodage matériel - Simple et propre
.hardware-buttons {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  flex: 1;
  margin-left: 1rem;
}

.hw-btn {
  padding: 0.4rem 1rem;
  border: 2px solid #64748b;
  background: #374151;
  color: #9ca3af;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.2s ease;
  font-weight: 600;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  
  &:hover:not(:disabled):not(.active) {
    border-color: #475569;
    background: #475569;
  }
  
  &.active {
    background: #22c55e;
    border-color: #16a34a;
    color: white;
    
    &:hover {
      background: #16a34a;
      border-color: #15803d;
    }
  }
  
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

// Animations
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

@keyframes pulse-error {
  0%, 100% { 
    border-color: var(--danger-red);
    box-shadow: 0 2px 10px rgba(255, 67, 67, 0.2);
  }
  50% { 
    border-color: #ff6b6b;
    box-shadow: 0 4px 20px rgba(255, 67, 67, 0.4);
  }
}

// Responsive
@media (max-width: 768px) {
  .streamer-card {
    padding: 1rem;
  }

  .card-header {
    flex-direction: column;
    gap: 1rem;
  }

  .streamer-info {
    .avatar-container .streamer-avatar {
      width: 40px;
      height: 40px;
    }
  }

  .technical-info .info-row {
    flex-direction: column;
    align-items: stretch;
    gap: 0.5rem;

    .url-container {
      margin-left: 0;
    }
  }

  .card-actions {
    flex-direction: column;
  }
}
/* Ajout couleur verte pour le badge online Twitch */
.status-badge.status-twitch-online {
  background: rgba(34, 197, 94, 0.15) !important;
  color: var(--success-green) !important;
  border: 1px solid var(--primary-green) !important;
}
.status-badge.status-twitch-offline {
  background: rgba(102, 102, 102, 0.15) !important;
  color: var(--text-muted) !important;
  border: 1px solid rgba(102, 102, 102, 0.3) !important;
}
</style>
