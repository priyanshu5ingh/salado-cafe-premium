// Smooth Scroll Navigation
document.addEventListener('DOMContentLoaded', function() {
    // Navigation scroll
    const navLinksItems = document.querySelectorAll('.nav-links a');

    navLinksItems.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();

            const targetId = this.getAttribute('href');
            const targetElement = document.querySelector(targetId);

            if (targetElement) {
                const navbarHeight = document.querySelector('.navbar').offsetHeight;
                const targetPosition = targetElement.offsetTop - navbarHeight;

                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });

                // Close mobile menu if open
                document.getElementById('navLinks').classList.remove('active');
                document.getElementById('menuToggle').classList.remove('active');
            }
        });
    });

    // Navbar scroll effect
    const navbar = document.querySelector('.navbar');
    const scrollThreshold = 50;

    window.addEventListener('scroll', function() {
        if (window.scrollY > scrollThreshold) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });

    // Mobile menu toggle
    const menuToggle = document.getElementById('menuToggle');
    const navLinks = document.getElementById('navLinks');

    menuToggle.addEventListener('click', function() {
        navLinks.classList.toggle('active');
        this.classList.toggle('active');
    });

    // Close mobile menu when clicking outside
    document.addEventListener('click', function(e) {
        if (!navLinks.contains(e.target) && !menuToggle.contains(e.target) && navLinks.classList.contains('active')) {
            navLinks.classList.remove('active');
            menuToggle.classList.remove('active');
        }
    });

    // Scroll Reveal Animation (Intersection Observer)
    const revealElements = document.querySelectorAll('.reveal, .section-header, .about-content > div, .menu-card, .gallery-item, .info-item, .contact-form-container');

    const revealOptions = {
        threshold: 0.1,
        rootMargin: "0px 0px -50px 0px"
    };

    const revealObserver = new IntersectionObserver(function(entries, observer) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                observer.unobserve(entry.target);
            }
        });
    }, revealOptions);

    revealElements.forEach(el => {
        revealObserver.observe(el);
    });

    // Hero animations handled largely via CSS, but trigger classes can be used if needed
    
    // Simple search demo setup
    const searchBtn = document.querySelector('.search-btn');
    if(searchBtn) {
        searchBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const input = document.querySelector('.search-input');
            if(input.value.trim() !== '') {
                // Simulate search
                input.value = 'Searching...';
                setTimeout(() => {
                    document.getElementById('menu').scrollIntoView({behavior: 'smooth'});
                    input.value = '';
                }, 800);
            }
        });
    }

    // Form submission
    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        contactForm.addEventListener('submit', function(e) {
            e.preventDefault();

            // Get form data
            const formData = new FormData(this);

            // Show success message (would normally send to backend)
            const submitBtn = this.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;

            submitBtn.textContent = 'Message Sent!';
            submitBtn.style.background = '#7ab632';

            setTimeout(() => {
                submitBtn.textContent = originalText;
                submitBtn.style.background = '';
                this.reset();
            }, 3000);
        });
    }

    // Menu Tabs Logic
    // (Deprecated: Menu is now an image gallery. Removed tab logic to prevent console errors)

    // Dark Mode Toggle Logic removed - Site is now fully dark theme native

    // Add smooth transition to menu items on hover
    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(item => {
        item.addEventListener('mouseenter', function() {
            this.style.transform = 'translateX(5px)';
        });

        item.addEventListener('mouseleave', function() {
            this.style.transform = 'translateX(0)';
        });
    });

    // --- 3D Menu Slider Logic ---
    const menuGallery = document.getElementById('menuGallery');
    const menuCards = document.querySelectorAll('.menu-card');
    const prevBtn = document.getElementById('prevMenu');
    const nextBtn = document.getElementById('nextMenu');
    const viewAllBtn = document.getElementById('viewAllMenuBtn');

    if (menuGallery) {
        const updateSlider3D = () => {
            const galleryRect = menuGallery.getBoundingClientRect();
            const galleryCenter = galleryRect.left + galleryRect.width / 2;

            menuCards.forEach(card => {
                if (card.style.display === 'none') return;

                const cardRect = card.getBoundingClientRect();
                const cardCenter = cardRect.left + cardRect.width / 2;
                const distanceFromCenter = cardCenter - galleryCenter;
                
                // Clear old classes
                card.classList.remove('active-slide', 'left-slide', 'right-slide');

                // Determine transform based on distance from viewport center
                if (Math.abs(distanceFromCenter) < 150) {
                    card.classList.add('active-slide');
                } else if (distanceFromCenter < 0) {
                    card.classList.add('left-slide');
                } else {
                    card.classList.add('right-slide');
                }
            });
        };

        menuGallery.addEventListener('scroll', () => {
            requestAnimationFrame(updateSlider3D);
        });

        // Initialize on load
        setTimeout(updateSlider3D, 200);

        // Navigation Buttons
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                const scrollAmount = menuCards[0].offsetWidth - 30; // Account for overlap
                menuGallery.scrollBy({ left: scrollAmount, behavior: 'smooth' });
            });
        }

        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                const scrollAmount = menuCards[0].offsetWidth - 30;
                menuGallery.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
            });
        }
    }

    // Menu category filtering logic
    window.filterMenu = function(category) {
        const menuSection = document.getElementById('menu');
        if(menuSection) {
            const navbarHeight = document.querySelector('.navbar').offsetHeight;
            const targetPosition = menuSection.offsetTop - navbarHeight;
            window.scrollTo({ top: targetPosition, behavior: 'smooth' });
        }

        let firstFilteredCard = null;

        menuCards.forEach(card => {
            if (category === 'all') {
                card.style.display = 'block';
                if (!firstFilteredCard) firstFilteredCard = card;
            } else {
                const categories = card.getAttribute('data-categories');
                if (categories && categories.includes(category)) {
                    card.style.display = 'block';
                    if (!firstFilteredCard) firstFilteredCard = card;
                } else {
                    card.style.display = 'none';
                    card.classList.remove('active-slide', 'left-slide', 'right-slide');
                }
            }
        });

        // Snap slider to the first visible card
        if (firstFilteredCard && menuGallery) {
            setTimeout(() => {
                menuGallery.scrollTo({
                    left: firstFilteredCard.offsetLeft - menuGallery.offsetWidth / 2 + firstFilteredCard.offsetWidth / 2,
                    behavior: 'smooth'
                });
            }, 500);
        }

        // Highlight "View All" button
        if(viewAllBtn) {
            if(category === 'all') {
                viewAllBtn.classList.remove('btn-primary');
                viewAllBtn.classList.add('btn-secondary');
            } else {
                viewAllBtn.classList.remove('btn-secondary');
                viewAllBtn.classList.add('btn-primary');
            }
        }
    };

    // --- Lightbox Logic ---
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightboxImg');

    window.openLightbox = function(src) {
        if (lightbox && lightboxImg) {
            lightboxImg.src = src;
            lightbox.style.display = "block";
            document.body.style.overflow = "hidden"; // Prevent scrolling
        }
    };

    window.closeLightbox = function() {
        if (lightbox) {
            lightbox.style.display = "none";
            document.body.style.overflow = "auto";
        }
    };

    // Advanced 3D Parallax Effect
    const parallaxItems = document.querySelectorAll('.parallax-item');
    if (parallaxItems.length > 0) {
        window.addEventListener('scroll', () => {
            requestAnimationFrame(() => {
                const scrolled = window.scrollY;
                parallaxItems.forEach(item => {
                    const speed = parseFloat(item.getAttribute('data-speed')) || 0;
                    // Move the item vertically based on scroll position and its assigned speed
                    const yPos = -(scrolled * speed);
                    // Keep the custom organic CSS rotation by only modifying translateY
                    item.style.transform = `translateY(${yPos}px)`;
                });
            });
        });
    }

    // --- Advanced Micro-Interactions ---

    // 1. Custom Interactive Cursor
    const cursor = document.querySelector('.cursor');
    const follower = document.querySelector('.cursor-follower');
    
    if (cursor && follower && window.innerWidth > 992) {
        let mouseX = 0, mouseY = 0;
        let followerX = 0, followerY = 0;

        document.addEventListener('mousemove', (e) => {
            mouseX = e.clientX;
            mouseY = e.clientY;
            
            // Instantly update tiny cursor
            cursor.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0) translate(-50%, -50%)`;
        });

        // Smoothly animate the follower ring
        const renderFollower = () => {
            // Easing equation for smooth trailing effect
            followerX += (mouseX - followerX) * 0.15;
            followerY += (mouseY - followerY) * 0.15;
            
            follower.style.transform = `translate3d(${followerX}px, ${followerY}px, 0) translate(-50%, -50%)`;
            requestAnimationFrame(renderFollower);
        };
        renderFollower();

        // Add Active State on Hoverable Elements
        const hoverables = document.querySelectorAll('a, button, .menu-card, .category-card');
        hoverables.forEach(el => {
            el.addEventListener('mouseenter', () => {
                cursor.classList.add('active');
                follower.classList.add('active');
            });
            el.addEventListener('mouseleave', () => {
                cursor.classList.remove('active');
                follower.classList.remove('active');
            });
        });
    }

    // 2. Magnetic Buttons
    const magnets = document.querySelectorAll('[data-magnetic]');
    
    magnets.forEach(magnet => {
        const text = magnet.querySelector('span'); // The independent text wrapper
        
        magnet.addEventListener('mousemove', (e) => {
            if(window.innerWidth <= 992) return; // Disable on mobile

            const rect = magnet.getBoundingClientRect();
            // Calculate distance from center of button (-1 to 1)
            const x = ((e.clientX - rect.left) / magnet.clientWidth) - 0.5;
            const y = ((e.clientY - rect.top) / magnet.clientHeight) - 0.5;
            
            // Magnetic Pull Strength
            const pullStrength = 20; 
            const textPullStrength = 10;
            
            // Move the button background
            magnet.style.transform = `translate(${x * pullStrength}px, ${y * pullStrength}px) scale(1.02)`;
            
            // Move the text slightly more/less for 3D separation effect
            if(text) {
                text.style.transform = `translate(${x * textPullStrength}px, ${y * textPullStrength}px)`;
            }
        });
        
        // Reset position on leave
        magnet.addEventListener('mouseleave', () => {
            magnet.style.transform = '';
            if(text) {
                text.style.transform = '';
            }
        });
    });
});

// Preload images for better performance
document.addEventListener('DOMContentLoaded', function() {
    const images = document.querySelectorAll('img');
    images.forEach(img => {
        if (img.complete) {
            img.style.opacity = '1';
        } else {
            img.style.opacity = '0';
            img.addEventListener('load', function() {
                this.style.opacity = '1';
            });
        }
    });
});

// Redundant sticky header logic removed.
