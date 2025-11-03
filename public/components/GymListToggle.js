// Gym list toggle component - handles mobile collapse/expand and responsive behavior
export function createGymListToggle() {
  const toggleBtn = document.getElementById('gymListToggle');
  const toggleBtnMobile = document.getElementById('gymListToggleMobile');
  const gymList = document.getElementById('gymList');
  const gymListWrapper = document.getElementById('gymListWrapper');
  const toggleIcon = document.getElementById('gymListToggleIcon');
  const toggleIconExpanded = document.getElementById('gymListToggleIconExpanded');
  const collapsedView = document.getElementById('gymListToggleCollapsed');
  const expandedView = document.getElementById('gymListToggleExpanded');
  const gymListContainer = document.getElementById('gymListContainer');
  
  if ((!toggleBtn && !toggleBtnMobile) || !gymList || !gymListWrapper || !toggleIcon) {
    return null;
  }

  // Constants
  const MOBILE_BREAKPOINT = 640;
  const HEADER_HEIGHT = 45;
  const BOTTOM_MARGIN = 16;
  const CONTAINER_MARGINS = 32;
  const DESKTOP_LIST_HEIGHT = '384px';
  const MIN_LIST_HEIGHT = 150;
  const MAX_LIST_HEIGHT = 400;

  let isExpanded = false;

  // Helper functions
  function calculateMobileListHeight() {
    const maxListHeight = window.innerHeight - HEADER_HEIGHT - BOTTOM_MARGIN - CONTAINER_MARGINS;
    return `${Math.max(MIN_LIST_HEIGHT, Math.min(maxListHeight, MAX_LIST_HEIGHT))}px`;
  }

  function isMobile() {
    return window.innerWidth < MOBILE_BREAKPOINT;
  }

  function updateToggleIcons(rotation) {
    if (toggleIcon) toggleIcon.style.transform = `rotate(${rotation}deg)`;
    if (toggleIconExpanded) toggleIconExpanded.style.transform = `rotate(${rotation}deg)`;
  }

  function setCollapsedState() {
    gymList.style.maxHeight = '0';
    updateToggleIcons(0);
    isExpanded = false;
    
    if (collapsedView) collapsedView.classList.remove('hidden');
    if (expandedView) expandedView.classList.add('hidden');
    
    if (gymListWrapper) {
      gymListWrapper.classList.remove('bg-white/95', 'backdrop-blur-sm', 'rounded-lg', 'shadow-xl', 'border', 'border-gray-200/50');
    }
    
    if (gymListContainer) {
      gymListContainer.style.width = 'auto';
      gymListContainer.style.maxWidth = 'none';
      gymListContainer.style.maxHeight = 'fit-content';
    }
  }

  function setExpandedState() {
    const listHeight = isMobile() ? calculateMobileListHeight() : DESKTOP_LIST_HEIGHT;
    gymList.style.maxHeight = listHeight;
    updateToggleIcons(180);
    isExpanded = true;
    
    if (collapsedView) collapsedView.classList.add('hidden');
    if (expandedView) expandedView.classList.remove('hidden');
    
    if (gymListWrapper) {
      gymListWrapper.classList.add('bg-white/95', 'backdrop-blur-sm', 'rounded-lg', 'shadow-xl', 'border', 'border-gray-200/50');
    }
    
    if (gymListContainer && isMobile()) {
      gymListContainer.style.width = 'calc(100vw - 1rem)';
      gymListContainer.style.maxWidth = 'calc(100vw - 1rem)';
      gymListContainer.style.maxHeight = 'calc(100vh - 1rem)';
    }
  }

  function setDesktopState() {
    gymList.style.maxHeight = DESKTOP_LIST_HEIGHT;
    updateToggleIcons(0);
    isExpanded = true;
    
    if (collapsedView) collapsedView.classList.add('hidden');
    if (expandedView) expandedView.classList.add('hidden');
    
    if (gymListWrapper) {
      gymListWrapper.classList.add('bg-white/95', 'backdrop-blur-sm', 'rounded-lg', 'shadow-xl', 'border', 'border-gray-200/50');
    }
    
    if (gymListContainer) {
      gymListContainer.style.width = '';
      gymListContainer.style.maxWidth = '';
      gymListContainer.style.maxHeight = '';
    }
  }

  function handleToggle() {
    if (!isMobile()) return;
    
    if (isExpanded) {
      setCollapsedState();
    } else {
      setExpandedState();
    }
  }

  // Initialize state
  if (isMobile()) {
    setCollapsedState();
  } else {
    setDesktopState();
  }

  // Event listeners
  if (toggleBtn) toggleBtn.addEventListener('click', handleToggle);
  if (toggleBtnMobile) toggleBtnMobile.addEventListener('click', handleToggle);

  window.addEventListener('resize', () => {
    if (isMobile()) {
      if (!isExpanded) {
        setCollapsedState();
      } else {
        setExpandedState();
      }
    } else {
      setDesktopState();
    }
  });

  // Public API
  return {
    isExpanded: () => isExpanded,
    preserveHeight: () => {
      if (isMobile() && isExpanded && gymList) {
        gymList.style.maxHeight = calculateMobileListHeight();
      }
    },
    getCurrentHeight: () => isMobile() && isExpanded ? gymList.style.maxHeight : null,
  };
}

