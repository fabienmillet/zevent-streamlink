<template>
  <div class="stat-card" :class="{ 'stat-card--loading': loading }">
    <!-- Icône décorative -->
    <div class="stat-card__icon">
      <component :is="iconComponent" :size="24" />
    </div>

    <!-- Contenu principal -->
    <div class="stat-card__content">
      <h3 class="stat-card__title">{{ title }}</h3>
      <div class="stat-card__value" ref="valueRef">
        {{ displayValue }}
      </div>
      <div class="stat-card__subtitle" v-if="subtitle">
        {{ subtitle }}
      </div>
    </div>

    <!-- Animation de chargement -->
    <div class="stat-card__loading" v-if="loading">
      <div class="stat-card__spinner"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, computed } from 'vue'
import { Users, Eye, DollarSign, Star, BarChart3 } from 'lucide-vue-next'

// Enregistrer tous les composants Chart.js - RETIRÉ

// Props
const props = defineProps({
  title: {
    type: String,
    required: true
  },
  value: {
    type: [String, Number],
    default: 0
  },
  subtitle: {
    type: String,
    default: ''
  },
  icon: {
    type: String,
    default: 'chart'
  },
  loading: {
    type: Boolean,
    default: false
  },
  animated: {
    type: Boolean,
    default: true
  }
})

// Refs
const valueRef = ref(null)
const animatedValue = ref(0)

// Computed
const displayValue = computed(() => {
  if (props.animated && typeof props.value === 'number') {
    return Math.floor(animatedValue.value).toLocaleString()
  }
  return props.value
})

const iconComponent = computed(() => {
  const icons = {
    users: Users,
    eye: Eye,
    heart: DollarSign,
    star: Star,
    chart: BarChart3
  }
  return icons[props.icon] || icons.chart
})

// Méthodes
const animateValue = (start, end, duration = 1000) => {
  const startTime = performance.now()
  const animate = (currentTime) => {
    const elapsed = currentTime - startTime
    const progress = Math.min(elapsed / duration, 1)
    
    // Easing function (ease-out)
    const easedProgress = 1 - Math.pow(1 - progress, 3)
    
    animatedValue.value = start + (end - start) * easedProgress
    
    if (progress < 1) {
      requestAnimationFrame(animate)
    }
  }
  requestAnimationFrame(animate)
}

// Watchers
watch(() => props.value, (newVal, oldVal) => {
  if (props.animated && typeof newVal === 'number' && typeof oldVal === 'number') {
    animateValue(oldVal, newVal)
  } else {
    animatedValue.value = newVal
  }
})

// Lifecycle
onMounted(() => {
  animatedValue.value = props.value
})
</script>

<style lang="scss" scoped>
.stat-card {
  position: relative;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 1.5rem;
  overflow: hidden;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  backdrop-filter: blur(15px);
  cursor: pointer;
  
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(135deg, 
      rgba(0, 255, 178, 0.08) 0%, 
      rgba(0, 255, 178, 0.02) 50%, 
      rgba(0, 0, 0, 0.1) 100%
    );
    opacity: 0;
    transition: opacity 0.4s ease;
    pointer-events: none;
  }

  &:hover {
    transform: translateY(-4px) scale(1.02);
    border-color: rgba(0, 255, 178, 0.4);
    box-shadow: 
      0 12px 40px rgba(0, 0, 0, 0.4),
      0 0 0 1px rgba(0, 255, 178, 0.15),
      0 0 30px rgba(0, 255, 178, 0.15);

    &::before {
      opacity: 1;
    }

    .stat-card__icon {
      color: #00FFB2;
      transform: scale(1.15) rotate(5deg);
      text-shadow: 0 0 15px rgba(0, 255, 178, 0.5);
    }
    
    .stat-card__value {
      text-shadow: 0 0 15px rgba(0, 255, 178, 0.4);
    }
  }

  // Animation d'entrée
  animation: statCardFadeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1);
  
  @for $i from 1 through 4 {
    &:nth-child(#{$i}) {
      animation-delay: #{($i - 1) * 0.1}s;
    }
  }

  &--loading {
    pointer-events: none;
    
    .stat-card__content {
      opacity: 0.6;
    }
  }
}

.stat-card__icon {
  position: absolute;
  top: 1rem;
  right: 1rem;
  color: rgba(255, 255, 255, 0.4);
  font-size: 1.5rem;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 2;
}

.stat-card__content {
  position: relative;
  z-index: 2;
}

.stat-card__title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.5rem;
}

.stat-card__value {
  font-size: 2rem;
  font-weight: 700;
  color: #00FFB2;
  line-height: 1.2;
  margin-bottom: 0.25rem;
  font-variant-numeric: tabular-nums;
  
  // Effet de glow sur le texte
  text-shadow: 0 0 10px rgba(0, 255, 178, 0.3);
}

.stat-card__subtitle {
  font-size: 0.75rem;
  color: var(--text-muted);
  font-weight: 500;
}

.stat-card__loading {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 3;
}

.stat-card__spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(0, 255, 178, 0.2);
  border-top: 2px solid #00FFB2;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

// Animations
@keyframes statCardFadeIn {
  0% {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

// Responsive
@media (max-width: 768px) {
  .stat-card {
    padding: 1rem;
  }
  
  .stat-card__value {
    font-size: 1.5rem;
  }
}
</style>
