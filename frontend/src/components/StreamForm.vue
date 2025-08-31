
<template>
  <div class="stream-form-container">
    <div class="form-buttons">
      <button 
        class="add-stream-btn"
        @click="showForm = !showForm"
        :class="{ active: showForm }"
      >
        <span class="btn-icon">
          <component :is="showForm ? X : Plus" :size="16" />
        </span>
        {{ showForm ? 'Annuler' : 'Ajouter un flux' }}
      </button>
      <button 
        class="zevent-btn"
        @click="openZEventModal"
        type="button"
      >
        <Zap :size="16" />
        ZEvent Streamers
      </button>
    </div>
    <transition name="slide-down">
      <div class="stream-form" v-if="showForm">
        <form @submit.prevent="submitForm">
          <div class="form-row">
            <div class="form-group">
              <label for="name" class="form-label">Nom du streamer</label>
              <input
                id="name"
                type="text"
                class="form-input"
                v-model="form.name"
                placeholder="Ex: alphacast"
                required
                @input="updateTwitchUrl"
              >
              <small class="form-help">Juste le nom du streamer (sans espaces)</small>
            </div>
            <div class="form-group">
              <label for="twitchUrl" class="form-label">URL Twitch (générée)</label>
              <input
                id="twitchUrl"
                type="url"
                class="form-input url-generated"
                v-model="form.twitchUrl"
                readonly
                placeholder="https://twitch.tv/..."
              >
              <small class="form-help">URL générée automatiquement</small>
            </div>
          </div>
          <div class="form-row form-row-quality">
            <div class="form-group form-group-quality">
              <label for="quality" class="form-label">Qualité</label>
              <div class="quality-fetch-inline quality-fetch-wide">
                <select
                  id="quality"
                  class="form-select quality-select-wide"
                  v-model="form.quality"
                  :disabled="qualityOptions.length === 0"
                >
                  <option value="" disabled v-if="qualityOptions.length === 0">-- Cliquez sur Fetch --</option>
                  <option v-for="q in qualityOptions" :key="q" :value="q">{{ q }}</option>
                </select>
                <button type="button" class="btn btn-secondary btn-fetch btn-fetch-wide" @click="fetchQualities" :disabled="fetchLoading" title="Récupérer les qualités disponibles">
                  <span v-if="!fetchLoading">Fetch</span>
                  <span v-else>Loading…</span>
                </button>
              </div>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label checkbox-label">
                <input
                  type="checkbox"
                  v-model="form.hardwareDecoding"
                  class="form-checkbox"
                >
                <span class="checkmark"></span>
                Décodage matériel OBS
              </label>
              <small class="form-help">Active le décodage matériel pour de meilleures performances (nécessite OBS connecté)</small>
            </div>
          </div>
          <div class="form-actions">
            <button
              type="button"
              class="btn btn-secondary"
              @click="resetForm"
            >
              Réinitialiser
            </button>
            <button
              type="submit"
              class="btn btn-primary"
              :disabled="loading"
            >
              <span class="btn-icon">
                <component :is="loading ? Clock : Rocket" :size="16" />
              </span>
              {{ loading ? 'Démarrage...' : 'Lancer le flux' }}
            </button>
          </div>
        </form>
      </div>
    </transition>

    <!-- Modal ZEvent Streamers -->
    <div v-if="showZEventModal" class="modal-overlay" @click="showZEventModal = false">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>Streamers ZEvent</h3>
          <button class="modal-close" @click="showZEventModal = false">×</button>
        </div>
        
        <!-- Barre de recherche -->
        <div class="search-bar">
          <input 
            type="text" 
            v-model="searchQuery"
            placeholder="Rechercher un streamer..."
            class="search-input"
          >
          <svg class="search-icon" width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="m19 19-4-4m0-7A7 7 0 1 1 1 8a7 7 0 0 1 14 0Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>

        <!-- Onglets -->
        <div class="tabs-container">
          <div class="tabs-nav">
            <button 
              class="tab-button"
              :class="{ active: activeTab === 'lan' }"
              @click="activeTab = 'lan'"
            >
              <Building :size="16" />
              Présenciel ({{ lanStreamers.length }})
            </button>
            <button 
              class="tab-button"
              :class="{ active: activeTab === 'online' }"
              @click="activeTab = 'online'"
            >
              <Globe :size="16" />
              Distanciel ({{ onlineStreamers.length }})
            </button>
          </div>
        </div>
        
        <div class="modal-body">
          <div v-if="loadingStreamers" class="loading-state">
            Chargement des streamers...
          </div>
          
          <div v-else-if="zeventStreamers.length === 0" class="empty-state">
            Aucun streamer trouvé
          </div>
          
          <div v-else-if="searchQuery && getCurrentStreamers().length === 0" class="empty-state">
            Aucun streamer trouvé pour "{{ searchQuery }}"
          </div>
          
          <div v-else class="tab-content">
            <!-- Contenu de l'onglet actif -->
            <div class="streamers-grid">
              <div 
                v-for="streamer in getCurrentStreamers()" 
                :key="streamer.twitch_id"
                class="streamer-card"
                :class="{ online: streamer.online }"
                @click="selectStreamer(streamer)"
              >
                <img :src="streamer.profileUrl" :alt="streamer.display" class="streamer-avatar">
                <div class="streamer-info">
                  <div class="streamer-name">{{ streamer.display }}</div>
                  <div class="streamer-status">
                    <span class="status-dot" :class="{ online: streamer.online }"></span>
                    {{ streamer.online ? streamer.game : 'Hors ligne' }}
                  </div>
                  <div v-if="streamer.online" class="viewer-count">
                    {{ streamer.viewersAmount.formatted }} viewers
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { 
  Plus, 
  X, 
  Rocket, 
  Building, 
  Globe, 
  Zap,
  Clock
} from 'lucide-vue-next'

const emit = defineEmits(['submit'])

const props = defineProps({
  loading: {
    type: Boolean,
    default: false
  }
})

const showForm = ref(false)
const showZEventModal = ref(false)
const loadingStreamers = ref(false)
const zeventStreamers = ref([])
const searchQuery = ref('')
const activeTab = ref('lan') // Onglet actif par défaut

// Propriétés calculées pour filtrer et séparer les streamers
const filteredStreamers = computed(() => {
  if (!searchQuery.value.trim()) {
    return zeventStreamers.value
  }
  
  const query = searchQuery.value.toLowerCase().trim()
  return zeventStreamers.value.filter(streamer => 
    streamer.display.toLowerCase().includes(query) ||
    streamer.twitch.toLowerCase().includes(query) ||
    (streamer.game && streamer.game.toLowerCase().includes(query))
  )
})

// Propriétés calculées pour séparer les streamers par localisation
const lanStreamers = computed(() => {
  return filteredStreamers.value.filter(streamer => streamer.location === 'LAN')
})

const onlineStreamers = computed(() => {
  return filteredStreamers.value.filter(streamer => streamer.location === 'Online')
})

// Fonction pour obtenir les streamers de l'onglet actif
const getCurrentStreamers = () => {
  return activeTab.value === 'lan' ? lanStreamers.value : onlineStreamers.value
}

const form = reactive({
  name: '',
  twitchUrl: '',
  quality: '',
  hardwareDecoding: false
  // port: null
})

// start empty: user must click Fetch to populate available qualities
const qualityOptions = ref([])
const fetchLoading = ref(false)

const fetchQualities = async () => {
  try {
    const target = form.twitchUrl || form.name
    if (!target) return
    fetchLoading.value = true
    const url = `${import.meta.env.VITE_API_BASE_URL}/api/qualities?twitchUrl=${encodeURIComponent(target)}`
    const res = await fetch(url)
    const data = await res.json()
    if (data && data.success && Array.isArray(data.qualities)) {
      // keep the full list returned by Streamlink (unique)
      qualityOptions.value = Array.from(new Set(data.qualities))
      // set default to first entry if none selected
      if (qualityOptions.value.length) {
        form.quality = qualityOptions.value[0]
      } else {
        form.quality = ''
      }
    }
  } catch (err) {
    console.error('Erreur fetchQualities:', err)
  } finally {
    fetchLoading.value = false
  }
}

// Fonctions pour l'API ZEvent
const fetchZEventStreamers = async () => {
  loadingStreamers.value = true
  try {
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/zevent-streamers`)
    const data = await response.json()
    zeventStreamers.value = data.live || []
  } catch (error) {
    console.error('Erreur lors du chargement des streamers ZEvent:', error)
    zeventStreamers.value = []
  } finally {
    loadingStreamers.value = false
  }
}

const selectStreamer = (streamer) => {
  // Auto-remplir le formulaire avec les données du streamer
  form.name = streamer.display
  form.twitchUrl = `https://www.twitch.tv/${streamer.twitch}`
  form.hardwareDecoding = false // S'assurer que le décodage matériel est désactivé par défaut
  
  // Fermer la modal et ouvrir le formulaire
  showZEventModal.value = false
  showForm.value = true
  
  // Auto-soumettre si le streamer est en ligne
  if (streamer.online) {
    setTimeout(() => {
      submitForm()
    }, 500)
  }
}

// Charger les streamers quand la modal s'ouvre
const openZEventModal = () => {
  showZEventModal.value = true
  searchQuery.value = '' // Réinitialiser la recherche
  activeTab.value = 'lan' // Commencer par l'onglet présenciel
  if (zeventStreamers.value.length === 0) {
    fetchZEventStreamers()
  }
}

const submitForm = () => {
  const formData = { ...form }

  // Do not force protocol here — backend will store m3u8 link


  emit('submit', formData)

  // Réinitialiser le formulaire après soumission
  resetForm()
  showForm.value = false
}

const resetForm = () => {
  form.name = ''
  form.twitchUrl = ''
  form.quality = '720p'
  form.hardwareDecoding = false
}

const updateTwitchUrl = () => {
  if (form.name.trim()) {
    // Nettoyer le nom (enlever espaces, caractères spéciaux)
    const cleanName = form.name.toLowerCase().trim().replace(/[^a-z0-9_]/g, '')
    form.twitchUrl = `https://twitch.tv/${cleanName}`
  } else {
    form.twitchUrl = ''
  }
}
</script>

<style lang="scss" scoped>
.stream-form-container {
  margin-bottom: 2rem;
}

.quality-fetch-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.btn-fetch {
  padding: 0.5rem 0.75rem;
  background: transparent;
  border: 1px solid rgba(255,255,255,0.08);
  color: var(--text-primary);
  border-radius: 6px;
  cursor: pointer;
}

.btn-fetch:hover {
  background: rgba(255,255,255,0.02);
  transform: translateY(-1px);
}

.form-select:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}


.form-select {
  /* match .form-input size/style */
  padding: 1.25rem 1.5rem;
  background: var(--dark-bg);
  border: 2px solid var(--border-color);
  border-radius: 1rem;
  color: var(--text-primary);
  font-size: 0.95rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--border-color);
  border-radius: 0.5rem;
  box-sizing: border-box;
  background: var(--dark-bg);
  color: var(--text-primary);
  transition: all 0.3s ease;
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;
  display: inline-block;
  vertical-align: middle;
}

.btn-fetch:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-fetch {
  padding: 0.75rem 1rem;
  height: auto;
  align-self: stretch;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.5rem;
}

/* stronger focus state to show green outline like the screenshot */
.form-select:focus {
  outline: none;
  border-color: var(--primary-green);
  box-shadow: 0 0 0 4px rgba(34,197,94,0.06);
}

/* ensure the select can shrink on small screens but stays large on desktop */
@media (max-width: 800px) {
  .form-select {
    min-width: 200px;
    width: 100%;
    height: 48px;
    font-size: 0.95rem;
  }
  .quality-fetch-row {
    flex-direction: row;
    align-items: center;
  }
}

.add-stream-btn {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  background: var(--gradient-primary);
  color: white;
  border: none;
  border-radius: 0.75rem;
  font-weight: 600;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.3s ease;
  width: 100%;
  justify-content: center;

  .btn-icon {
    display: flex;
    align-items: center;
    margin-right: 0.5rem;
  }

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(0, 255, 178, 0.3);
  }

  &.active {
    background: var(--gradient-danger);
    border: 1px solid var(--danger-red-hover);
    
    &:hover {
      background: var(--danger-red-hover);
      box-shadow: 0 8px 25px rgba(239, 68, 68, 0.25);
    }

    &:focus {
      outline: 2px solid var(--danger-red);
      outline-offset: 2px;
    }
  }

  &:not(.active) {
    &:focus {
      outline: 2px solid var(--primary-green);
      outline-offset: 2px;
    }

    &:hover {
      box-shadow: 0 8px 25px rgba(34, 197, 94, 0.25);
    }
  }
}

.stream-form {
  margin-top: 1.5rem;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 0.75rem;
  padding: 2rem;
}


.form-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1.5rem;
  margin-bottom: 1.2rem;
}

.form-row-quality {
  margin-bottom: 0.5rem;
}

.form-group-quality {
  margin-bottom: 0;
}

.quality-fetch-inline {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.2rem;
}
.quality-fetch-wide {
  width: 100%;
}
.quality-select-wide {
  flex: 1 1 0%;
  min-width: 0;
  width: 100%;
  max-width: 100%;
}
.btn-fetch-wide {
  min-width: 110px;
  height: 48px;
  font-size: 1rem;
  margin-left: 0.5rem;
}

.form-group {
  display: flex;
  flex-direction: column;

  .form-label {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: 0.5rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .form-input,
  .form-select {
    padding: 0.75rem 1rem;
    background: var(--dark-bg);
    border: 1px solid var(--border-color);
    border-radius: 0.5rem;
    color: var(--text-primary);
    font-size: 0.95rem;
    transition: all 0.3s ease;

    &:focus {
      outline: none;
      border-color: var(--primary-green);
      box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.15);
    }

    &:hover:not(:focus) {
      border-color: var(--text-muted);
    }

    &::placeholder {
      color: var(--text-muted);
    }

    &:invalid {
      border-color: var(--danger-red);
    }

    &:invalid:focus {
      box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.15);
    }

    &.url-generated {
      background: var(--card-bg);
      border-style: dashed;
      color: var(--text-secondary);
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 0.85rem;
    }
  }

  .form-help {
    display: block;
    margin-top: 0.25rem;
    font-size: 0.75rem;
    color: var(--text-muted);
    font-style: italic;
  }

  .form-select {
    cursor: pointer;

    option {
      background: var(--card-bg);
      color: var(--text-primary);
    }
  }
}


.form-actions {
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
  margin-top: 1.2rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border-color);

  .btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 0.5rem;
    font-weight: 600;
    font-size: 0.95rem;
    cursor: pointer;
    transition: all 0.3s ease;

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-icon {
      font-size: 0.9rem;
    }

    &.btn-primary {
      background: var(--gradient-primary);
      color: white;
      border: 1px solid var(--primary-green-dark);

      &:hover:not(:disabled) {
        background: var(--primary-green-hover);
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(34, 197, 94, 0.25);
      }

      &:focus {
        outline: 2px solid var(--primary-green);
        outline-offset: 2px;
      }
    }

    &.btn-secondary {
      background: var(--border-color);
      color: var(--text-secondary);
      border: 1px solid var(--border-color);

      &:hover:not(:disabled) {
        background: var(--text-muted);
        color: var(--text-primary);
        border-color: var(--text-muted);
      }

      &:focus {
        outline: 2px solid var(--accent-blue);
        outline-offset: 2px;
      }
    }
  }
}

// Animations
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.4s ease;
  transform-origin: top;
}

.slide-down-enter-from {
  opacity: 0;
  transform: translateY(-20px) scaleY(0.8);
}

.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-20px) scaleY(0.8);
}

// Style pour les boutons de formulaire
.form-buttons {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
}

.zevent-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  background: var(--primary-blue);
  color: white;
  border: none;
  border-radius: 0.5rem;
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.3s ease;

  &:hover {
    background: var(--primary-blue-dark);
    transform: translateY(-2px);
    box-shadow: 0 4px 15px rgba(59, 130, 246, 0.3);
  }
}

// Modal styles
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.modal-content {
  background: var(--card-bg);
  border-radius: 1rem;
  border: 1px solid var(--border-color);
  max-width: 1200px;
  max-height: 85vh;
  width: 95vw;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.5rem;
  border-bottom: 1px solid var(--border-color);

  h3 {
    margin: 0;
    color: var(--text-primary);
    font-size: 1.25rem;
  }

  .modal-close {
    background: none;
    border: none;
    font-size: 1.5rem;
    color: var(--text-muted);
    cursor: pointer;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: all 0.2s ease;

    &:hover {
      background: var(--hover-bg);
      color: var(--text-primary);
    }
  }
}

.search-bar {
  position: relative;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);

  .search-input {
    width: 100%;
    padding: 0.75rem 1rem 0.75rem 2.5rem;
    background: var(--card-bg);
    border: 1px solid var(--border-color);
    border-radius: 0.5rem;
    color: var(--text-primary);
    font-size: 0.9rem;
    transition: all 0.3s ease;

    &:focus {
      outline: none;
      border-color: var(--primary-green);
      box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.1);
    }

    &::placeholder {
      color: var(--text-muted);
    }
  }

  .search-icon {
    position: absolute;
    left: 2rem;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-muted);
    pointer-events: none;
  }
}

.tabs-container {
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);

  .tabs-nav {
    display: flex;
    
    .tab-button {
      flex: 1;
      padding: 1rem 1.5rem;
      background: transparent;
      border: none;
      color: var(--text-muted);
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      
      &:hover {
        color: var(--text-primary);
        background: var(--hover-bg);
      }
      
      &.active {
        color: var(--primary-green);
        background: var(--card-bg);
        
        &::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: var(--primary-green);
        }
      }
    }
  }
}

.tab-content {
  padding: 1.5rem;
}

.modal-body {
  overflow-y: auto;
  flex: 1;
}

.loading-state, .empty-state {
  text-align: center;
  padding: 2rem;
  color: var(--text-muted);
  font-size: 1rem;
}

.streamers-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
}

.streamer-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 0.75rem;
  cursor: pointer;
  transition: all 0.3s ease;

  &:hover {
    border-color: var(--primary-green);
    transform: translateY(-2px);
    box-shadow: 0 4px 15px rgba(34, 197, 94, 0.2);
  }

  &.online {
    border-color: var(--success-green);
    background: rgba(34, 197, 94, 0.05);
  }
}

.streamer-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
}

.streamer-info {
  flex: 1;
  min-width: 0;

  .streamer-name {
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 0.25rem;
  }

  .streamer-status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--text-secondary);
    font-size: 0.85rem;
    margin-bottom: 0.25rem;

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--text-muted);

      &.online {
        background: var(--success-green);
        box-shadow: 0 0 6px rgba(34, 197, 94, 0.6);
      }
    }
  }

  .viewer-count {
    color: var(--primary-green);
    font-size: 0.8rem;
    font-weight: 500;
  }
}

// Responsive
@media (max-width: 768px) {
  .stream-form {
    padding: 1.5rem;
  }

  .form-row {
    grid-template-columns: 1fr;
    gap: 1rem;
  }

  .form-actions {
    flex-direction: column;
    gap: 0.75rem;

    .btn {
      width: 100%;
      justify-content: center;
    }
  }

  .form-buttons {
    flex-direction: column;
  }

  .streamers-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .modal-content {
    margin: 1rem;
    max-height: calc(100vh - 2rem);
    width: calc(100vw - 2rem);
  }
}

// Checkbox styles
.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  cursor: pointer;
  font-weight: 500;
  
  .form-checkbox {
    opacity: 0;
    position: absolute;
  }
  
  .checkmark {
    width: 20px;
    height: 20px;
    border: 2px solid var(--border-color);
    border-radius: 4px;
    position: relative;
    transition: all 0.3s ease;
    
    &:after {
      content: "";
      position: absolute;
      display: none;
      left: 6px;
      top: 2px;
      width: 5px;
      height: 10px;
      border: solid white;
      border-width: 0 2px 2px 0;
      transform: rotate(45deg);
    }
  }
  
  .form-checkbox:checked + .checkmark {
    background-color: var(--primary-green);
    border-color: var(--primary-green);
    
    &:after {
      display: block;
    }
  }
  
  .form-checkbox:disabled + .checkmark {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

@media (max-width: 480px) {
  .streamers-grid {
    grid-template-columns: 1fr;
  }
}
</style>
