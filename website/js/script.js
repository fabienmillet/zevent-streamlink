// Navigation mobile
const hamburger = document.querySelector('.hamburger');
const navMenu = document.querySelector('.nav-menu');

hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    navMenu.classList.toggle('active');
});

// Fermer le menu mobile quand on clique sur un lien
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
        hamburger.classList.remove('active');
        navMenu.classList.remove('active');
    });
});

// Scroll smooth pour les liens d'ancrage
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Effet de scroll sur la navbar
const navbar = document.querySelector('.navbar');
let lastScrollY = window.scrollY;

window.addEventListener('scroll', () => {
    const currentScrollY = window.scrollY;
    
    if (currentScrollY > 100) {
        navbar.style.background = 'rgba(15, 15, 15, 0.98)';
        navbar.style.backdropFilter = 'blur(20px)';
        navbar.style.boxShadow = '0 4px 20px rgba(0, 255, 136, 0.1)';
    } else {
        navbar.style.background = 'rgba(15, 15, 15, 0.95)';
        navbar.style.backdropFilter = 'blur(10px)';
        navbar.style.boxShadow = 'none';
    }
    
    // Cacher/montrer la navbar selon la direction du scroll
    if (currentScrollY > lastScrollY && currentScrollY > 200) {
        navbar.style.transform = 'translateY(-100%)';
    } else {
        navbar.style.transform = 'translateY(0)';
    }
    
    lastScrollY = currentScrollY;
});

// Animation des éléments au scroll
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// Observer tous les éléments avec la classe animate
document.querySelectorAll('.feature-card, .tech-item, .doc-card, .step').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(30px)';
    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(el);
});

// Fonction de copie pour les blocs de code
function copyToClipboard(button) {
    const codeBlock = button.parentElement;
    const code = codeBlock.querySelector('code');
    const text = code.textContent;
    
    navigator.clipboard.writeText(text).then(() => {
        // Feedback visuel
        const originalIcon = button.innerHTML;
        button.innerHTML = '<i class="fas fa-check"></i>';
        button.style.background = 'rgba(0, 255, 136, 0.3)';
        
        setTimeout(() => {
            button.innerHTML = originalIcon;
            button.style.background = 'rgba(0, 255, 136, 0.2)';
        }, 2000);
    }).catch(err => {
        console.error('Erreur lors de la copie:', err);
        // Fallback pour les navigateurs plus anciens
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        
        // Feedback visuel
        const originalIcon = button.innerHTML;
        button.innerHTML = '<i class="fas fa-check"></i>';
        button.style.background = 'rgba(0, 255, 136, 0.3)';
        
        setTimeout(() => {
            button.innerHTML = originalIcon;
            button.style.background = 'rgba(0, 255, 136, 0.2)';
        }, 2000);
    });
}

// Animation du hero card
const heroCard = document.querySelector('.hero-card');
if (heroCard) {
    // Animation de floating
    let floatDirection = 1;
    setInterval(() => {
        heroCard.style.transform = `perspective(1000px) rotateY(-5deg) rotateX(5deg) translateY(${Math.sin(Date.now() * 0.001) * 5}px)`;
    }, 16);
    
    // Animation des éléments à l'intérieur de la card
    const streamItems = document.querySelectorAll('.stream-item');
    streamItems.forEach((item, index) => {
        setTimeout(() => {
            const status = item.querySelector('.stream-status');
            if (status.classList.contains('live')) {
                // Animation du statut live
                setInterval(() => {
                    status.style.opacity = status.style.opacity === '0.7' ? '1' : '0.7';
                }, 1000);
            }
        }, index * 500);
    });
}

// Effet de parallax léger sur le hero
window.addEventListener('scroll', () => {
    const scrolled = window.pageYOffset;
    const hero = document.querySelector('.hero');
    const heroContent = document.querySelector('.hero-content');
    const heroImage = document.querySelector('.hero-image');
    
    if (hero && scrolled < hero.offsetHeight) {
        if (heroContent) {
            heroContent.style.transform = `translateY(${scrolled * 0.5}px)`;
        }
        if (heroImage) {
            heroImage.style.transform = `translateY(${scrolled * 0.3}px)`;
        }
    }
});

// Gestion des liens externes
document.querySelectorAll('a[target="_blank"]').forEach(link => {
    link.addEventListener('click', (e) => {
        // Ajouter rel="noopener noreferrer" pour la sécurité
        link.setAttribute('rel', 'noopener noreferrer');
    });
});

// Animation des statistiques du hero
const heroStats = document.querySelectorAll('.hero-stats .stat');
heroStats.forEach((stat, index) => {
    setTimeout(() => {
        stat.style.opacity = '1';
        stat.style.transform = 'translateX(0)';
    }, index * 200 + 1000);
    
    // Initialiser les styles
    stat.style.opacity = '0';
    stat.style.transform = 'translateX(-20px)';
    stat.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
});

// Animation des tech items
const techItems = document.querySelectorAll('.tech-item');
techItems.forEach((item, index) => {
    item.addEventListener('mouseenter', () => {
        item.style.transform = 'translateY(-8px) scale(1.05)';
    });
    
    item.addEventListener('mouseleave', () => {
        item.style.transform = 'translateY(-2px) scale(1)';
    });
});

// Lazy loading pour les images
const images = document.querySelectorAll('img[data-src]');
const imageObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const img = entry.target;
            img.src = img.dataset.src;
            img.classList.remove('lazy');
            imageObserver.unobserve(img);
        }
    });
});

images.forEach(img => imageObserver.observe(img));

// Gestion du thème sombre (optionnel pour le futur)
const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');

function toggleTheme() {
    if (prefersDarkScheme.matches) {
        document.body.classList.add('dark-theme');
    } else {
        document.body.classList.remove('dark-theme');
    }
}

// Écouter les changements de préférence de thème
prefersDarkScheme.addEventListener('change', toggleTheme);

// Initialiser le thème
toggleTheme();

// Amélioration de l'accessibilité
document.addEventListener('keydown', (e) => {
    // Échapper ferme le menu mobile
    if (e.key === 'Escape' && navMenu.classList.contains('active')) {
        hamburger.classList.remove('active');
        navMenu.classList.remove('active');
    }
});

// Focus trap pour le menu mobile
const focusableElements = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function trapFocus(element) {
    const focusableEls = element.querySelectorAll(focusableElements);
    const firstFocusableEl = focusableEls[0];
    const lastFocusableEl = focusableEls[focusableEls.length - 1];
    
    element.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
            if (e.shiftKey) {
                if (document.activeElement === firstFocusableEl) {
                    lastFocusableEl.focus();
                    e.preventDefault();
                }
            } else {
                if (document.activeElement === lastFocusableEl) {
                    firstFocusableEl.focus();
                    e.preventDefault();
                }
            }
        }
    });
}

// Appliquer le focus trap quand le menu mobile est ouvert
hamburger.addEventListener('click', () => {
    if (navMenu.classList.contains('active')) {
        trapFocus(navMenu);
        // Focus sur le premier lien du menu
        const firstLink = navMenu.querySelector('.nav-link');
        if (firstLink) {
            setTimeout(() => firstLink.focus(), 100);
        }
    }
});

// Animation de typing pour le titre du hero (optionnel)
function typeWriter(element, text, speed = 50) {
    let i = 0;
    element.innerHTML = '';
    
    function type() {
        if (i < text.length) {
            element.innerHTML += text.charAt(i);
            i++;
            setTimeout(type, speed);
        }
    }
    
    type();
}

// Initialisation complète une fois que le DOM est chargé
document.addEventListener('DOMContentLoaded', () => {
    // Cacher le loader si présent
    const loader = document.querySelector('.loader');
    if (loader) {
        setTimeout(() => {
            loader.style.opacity = '0';
            setTimeout(() => loader.remove(), 300);
        }, 500);
    }
    
    // Animation d'entrée pour les éléments principaux
    const heroTitle = document.querySelector('.hero-title');
    const heroDescription = document.querySelector('.hero-description');
    const heroButtons = document.querySelector('.hero-buttons');
    
    if (heroTitle) {
        setTimeout(() => {
            heroTitle.style.opacity = '1';
            heroTitle.style.transform = 'translateY(0)';
        }, 200);
    }
    
    if (heroDescription) {
        setTimeout(() => {
            heroDescription.style.opacity = '1';
            heroDescription.style.transform = 'translateY(0)';
        }, 400);
    }
    
    if (heroButtons) {
        setTimeout(() => {
            heroButtons.style.opacity = '1';
            heroButtons.style.transform = 'translateY(0)';
        }, 600);
    }
    
    // Initialiser les styles pour l'animation
    [heroTitle, heroDescription, heroButtons].forEach(el => {
        if (el) {
            el.style.opacity = '0';
            el.style.transform = 'translateY(30px)';
            el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        }
    });
});

// Performance: Debounce pour les événements de scroll
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Appliquer le debounce aux événements de scroll
const debouncedScrollHandler = debounce(() => {
    // Logique de scroll ici si nécessaire
}, 10);

window.addEventListener('scroll', debouncedScrollHandler);

console.log('🚀 ZEvent-Streamlink website loaded successfully!');
