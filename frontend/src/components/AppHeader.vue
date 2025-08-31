<template>
  <header class="app-header">
    <div class="header-content">
      <!-- Logo et titre -->
      <div class="header-left">
        <div class="logo">
          <!-- <div class="logo-icon">🎮</div> -->
          <h1 class="app-title">ZEvent Streamlink</h1>
        </div>
      </div>

      <!-- Actions globales -->
      <div class="header-right">
        <!-- Boutons de contrôle global supprimés -->
      </div>
    </div>
  </header>
</template>

<script setup>
const props = defineProps({
  bestQuality: {
    type: String,
    default: 'N/A'
  },
  activeCount: {
    type: Number,
    default: 0
  },
  totalCount: {
    type: Number,
    default: 0
  },
  loading: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['startAll', 'stopAll'])
</script>

<style lang="scss" scoped>
.app-header {
  background: var(--card-bg);
  border-bottom: 1px solid var(--border-color);
  padding: 1rem 2rem;
  position: sticky;
  top: 0;
  z-index: 100;
  backdrop-filter: blur(10px);

  .header-content {
    max-width: 1400px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 2rem;
  }
}

.header-left {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  
  .logo {
    display: flex;
    align-items: center;
    gap: 0.75rem;

    .logo-icon {
      font-size: 2rem;
      filter: drop-shadow(0 0 10px var(--primary-green));
    }

    .app-title {
      font-size: 1.5rem;
      font-weight: 700;
      background: var(--gradient-primary);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
  }
}

.header-right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 1.5rem;

  .stream-count {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    
    .count-text {
      color: var(--text-secondary);
      font-size: 0.9rem;
      font-weight: 500;
    }
    
    .quality-info {
      color: var(--primary-green);
      font-size: 0.9rem;
      font-weight: 600;
    }
  }

  .global-actions {
    display: flex;
    gap: 0.75rem;
  }
}

.btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  border: none;
  border-radius: 0.5rem;
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.3s ease;
  text-decoration: none;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-icon {
    font-size: 0.8rem;
  }

  &.btn-success {
    background: var(--gradient-primary);
    color: white;
    border: 1px solid var(--primary-green-dark);

    &:hover:not(:disabled) {
      background: var(--primary-green-hover);
      transform: translateY(-2px);
      box-shadow: 0 8px 25px rgba(34, 197, 94, 0.25);
    }

    &:focus {
      outline: 2px solid var(--primary-green);
      outline-offset: 2px;
    }
  }

  &.btn-danger {
    background: var(--gradient-danger);
    color: white;
    border: 1px solid var(--danger-red-hover);

    &:hover:not(:disabled) {
      background: var(--danger-red-hover);
      transform: translateY(-2px);
      box-shadow: 0 8px 25px rgba(239, 68, 68, 0.25);
    }

    &:focus {
      outline: 2px solid var(--danger-red);
      outline-offset: 2px;
    }
  }
}

// Responsive
@media (max-width: 1024px) {
  .app-header {
    padding: 1rem;

    .header-content {
      flex-direction: column;
      gap: 1rem;
    }
  }

  .header-center,
  .header-right {
    width: 100%;
    justify-content: center;
  }

  .global-actions {
    width: 100%;
    justify-content: center;
  }
}

@media (max-width: 768px) {
  .header-left .logo .app-title {
    font-size: 1.25rem;
  }

  .global-status {
    flex-direction: column;
    gap: 0.75rem !important;
  }

  .btn {
    padding: 0.6rem 1rem;
    font-size: 0.8rem;
  }
}
</style>
