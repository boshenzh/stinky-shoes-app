// Gym list sort button handler - manages sort order toggle with clean event delegation
export function createGymListSort(gymList, toggleState) {
  const sortWrapper = document.getElementById('gymListWrapper');
  if (!sortWrapper) return;

  // SVG paths for sort icons
  const SORT_PATHS = {
    desc: "M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4",
    asc: "M7 4v12m0 0l-4-4m4 4l4 4m6-12v12m0 0l4-4m-4 4l-4-4",
  };

  function updateSortIcons() {
    const order = gymList.getSortOrder();
    const sortIcon = document.getElementById('gymListSortIcon');
    const sortIconDesktop = document.getElementById('gymListSortIconDesktop');
    
    [sortIcon, sortIconDesktop].forEach(icon => {
      if (icon) {
        const path = icon.querySelector('path');
        if (path) {
          path.setAttribute('d', SORT_PATHS[order]);
          icon.style.transform = order === 'desc' ? 'rotate(0deg)' : 'rotate(180deg)';
        }
      }
    });
  }

  function handleSortToggle(e) {
    e.stopPropagation();
    e.preventDefault();

    // Preserve mobile expanded state during render
    const wasExpanded = toggleState?.isExpanded();
    const currentHeight = toggleState?.getCurrentHeight();

    // Toggle sort order (triggers render)
    gymList.toggleSortOrder();
    updateSortIcons();

    // Restore height after render on mobile
    if (window.innerWidth < 640 && wasExpanded && currentHeight && toggleState) {
      requestAnimationFrame(() => {
        toggleState.preserveHeight();
      });
    }
  }

  // Event delegation - works even if buttons are re-rendered
  sortWrapper.addEventListener('click', (e) => {
    const target = e.target.closest('#gymListSortBtn, #gymListSortBtnDesktop');
    if (target) {
      handleSortToggle(e);
    }
  });

  // Initial icon update
  updateSortIcons();
}

