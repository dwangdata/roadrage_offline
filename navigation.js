// navigation.js - Client-side navigation handler for preventing page reloads during active rides

class NavigationManager {
  constructor() {
    this.sessionId = null;
    this.hasActiveRide = false;
    this.currentPage = this.getCurrentPage();
    this.initializeSession();
    this.setupNavigationHandlers();
  }

  getCurrentPage() {
    const path = window.location.pathname;
    if (path === '/' || path === '/index.html') return 'tracking';
    if (path === '/route-planner' || path.includes('route-planner')) return 'planner';
    if (path === '/status' || path.includes('status')) return 'status';
    return 'tracking';
  }

  async initializeSession() {
    try {
      // Get or create session ID
      this.sessionId = sessionStorage.getItem('fleetsense-session-id') || 
                     localStorage.getItem('fleetsense-session-id') ||
                     this.generateSessionId();
      
      // Store session ID
      sessionStorage.setItem('fleetsense-session-id', this.sessionId);
      localStorage.setItem('fleetsense-session-id', this.sessionId);

      // Check for active ride
      await this.checkActiveRide();
      
      // Also check for locally active rides (in case of offline mode)
      this.checkLocalActiveRide();
    } catch (error) {
      console.warn('Session initialization failed:', error);
      this.sessionId = this.generateSessionId();
    }
  }

  checkLocalActiveRide() {
    // Check if there's a currentRideId in the global scope (from script.js)
    if (typeof window.currentRideId !== 'undefined' && window.currentRideId) {
      this.hasActiveRide = true;
      console.log('Found local active ride:', window.currentRideId);
      return;
    }

    // Check for stored ride state in localStorage (for recovery)
    const storedRideId = localStorage.getItem('fleetsense-active-ride');
    if (storedRideId) {
      this.hasActiveRide = true;
      console.log('Found stored active ride:', storedRideId);
    }
  }

  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async checkActiveRide() {
    try {
      const response = await fetch('/api/session/status', {
        headers: {
          'X-Session-ID': this.sessionId
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        this.hasActiveRide = data.hasActiveRide;
        this.sessionId = data.sessionId;
        
        // Update session ID if server provided a new one
        sessionStorage.setItem('fleetsense-session-id', this.sessionId);
        localStorage.setItem('fleetsense-session-id', this.sessionId);
        
        console.log('Session status:', { 
          sessionId: this.sessionId, 
          hasActiveRide: this.hasActiveRide,
          activeRide: data.activeRide 
        });
      }
    } catch (error) {
      console.warn('Failed to check active ride status:', error);
    }
  }

  setupNavigationHandlers() {
    // Intercept navigation clicks
    document.addEventListener('click', (event) => {
      const link = event.target.closest('a[href]');
      if (!link) return;

      const href = link.getAttribute('href');
      
      // Only handle internal navigation
      if (href.startsWith('http') || href.startsWith('//')) return;
      
      // Check if we should prevent navigation due to active ride
      if (this.shouldPreventNavigation(href)) {
        event.preventDefault();
        this.handleNavigationWarning(href);
        return;
      }

      // For safe navigation, add session ID to maintain state
      if (this.sessionId) {
        const url = new URL(href, window.location.origin);
        url.searchParams.set('sessionId', this.sessionId);
        
        // Update the link temporarily for this navigation
        const originalHref = link.href;
        link.href = url.toString();
        
        // Restore original href after a short delay
        setTimeout(() => {
          link.href = originalHref;
        }, 100);
      }
    });

    // Handle browser back/forward navigation
    window.addEventListener('beforeunload', (event) => {
      if (this.hasActiveRide) {
        const message = 'You have an active trip recording. Leaving this page may cause data loss.';
        event.returnValue = message;
        return message;
      }
    });

    // Handle page visibility changes
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.hasActiveRide) {
        // Page became visible again, check if ride is still active
        this.checkActiveRide();
      }
    });
  }

  shouldPreventNavigation(href) {
    // Don't prevent navigation if no active ride
    if (!this.hasActiveRide) return false;

    // Allow navigation within the same page (hash changes)
    if (href.startsWith('#')) return false;

    // Get target page
    const targetPage = this.getPageFromHref(href);
    
    // Allow staying on the same page
    if (targetPage === this.currentPage) return false;

    // Prevent navigation to other pages during active ride
    return true;
  }

  getPageFromHref(href) {
    if (href === '/' || href === '/index.html' || href.includes('index')) return 'tracking';
    if (href.includes('route-planner')) return 'planner';
    if (href.includes('status')) return 'status';
    return 'tracking';
  }

  handleNavigationWarning(href) {
    const targetPage = this.getPageFromHref(href);
    const pageNames = {
      'tracking': 'Live Tracking',
      'planner': 'Route Planner',
      'status': 'Status'
    };

    const message = `You have an active trip recording in progress. Please stop the current trip before navigating to ${pageNames[targetPage] || 'another page'}.`;
    
    // Show a user-friendly warning
    if (this.showNavigationWarning) {
      this.showNavigationWarning(message, href);
    } else {
      // Fallback to browser alert
      alert(message);
    }
  }

  // Method to be called when ride starts
  async setActiveRide(rideId, startTime) {
    this.hasActiveRide = true;
    
    // Store ride ID for recovery
    localStorage.setItem('fleetsense-active-ride', rideId.toString());
    localStorage.setItem('fleetsense-active-ride-start', startTime.toString());
    
    try {
      await fetch('/api/session/ride/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-ID': this.sessionId
        },
        body: JSON.stringify({ rideId, startTime })
      });
    } catch (error) {
      console.warn('Failed to update session with active ride:', error);
    }
  }

  // Method to be called when ride stops
  async clearActiveRide() {
    this.hasActiveRide = false;
    
    // Clear stored ride state
    localStorage.removeItem('fleetsense-active-ride');
    localStorage.removeItem('fleetsense-active-ride-start');
    
    try {
      await fetch('/api/session/ride/stop', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-ID': this.sessionId
        }
      });
    } catch (error) {
      console.warn('Failed to clear session active ride:', error);
    }
  }

  // Get session ID for API requests
  getSessionId() {
    return this.sessionId;
  }

  // Set custom warning handler
  setWarningHandler(handler) {
    this.showNavigationWarning = handler;
  }
}

// Initialize navigation manager when DOM is ready
let navigationManager;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    navigationManager = new NavigationManager();
    window.navigationManager = navigationManager;
  });
} else {
  navigationManager = new NavigationManager();
  window.navigationManager = navigationManager;
}

// Export for use in other scripts
window.NavigationManager = NavigationManager;