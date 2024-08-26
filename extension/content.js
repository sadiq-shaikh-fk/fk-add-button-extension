// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function () {
    // Try to find the masthead buttons container
    const buttonsContainer = document.querySelector('#buttons');
  
    // Function to inject the custom button
    function injectCustomButton() {
      // Check if the container exists and if the button has not already been added
      if (buttonsContainer && !document.querySelector('#custom-extension-button')) {
        // Create the new button element
        const newButton = document.createElement('button');
        newButton.id = 'custom-extension-button';
        newButton.className = 'style-scope ytd-topbar-menu-button-renderer style-default';
        newButton.setAttribute('aria-label', 'Send URL to Backend');
        newButton.setAttribute('title', 'Send URL to Backend');
        newButton.style.marginLeft = '10px'; // Optional: Add margin to separate it from existing buttons
  
        // Add an icon to the button
        const iconElement = document.createElement('img');
        iconElement.src = chrome.runtime.getURL('icons/custom_button_icon.png'); // Button icon
        iconElement.style.width = '24px';
        iconElement.style.height = '24px';
        iconElement.style.display = 'block';
  
        newButton.appendChild(iconElement);
  
        // Add click event to the button
        newButton.addEventListener('click', async () => {
          // Get the current tab's URL (YouTube video or channel URL)
          const url = window.location.href;
  
          // Get the OAuth token from the background script
          chrome.runtime.sendMessage({ type: 'getToken' }, async (response) => {
            if (response.token) {
              try {
                // Send the URL to the backend API
                const res = await fetch('http://YOUR_VM_EXTERNAL_IP:8080/checkChannel', {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${response.token}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({ url: url })
                });
  
                const result = await res.json();
                
                // Provide feedback based on the API response
                if (res.ok) {
                  alert(`Success: ${result.message}`);
                } else {
                  alert(`Error: ${result.message}`);
                }
              } catch (error) {
                alert('Failed to send URL to backend.');
              }
            } else {
              alert('Authorization failed. Please sign in.');
            }
          });
        });
  
        // Inject the button into the container
        buttonsContainer.appendChild(newButton);
      }
    }
  
    // Call the function to inject the button after the DOM is ready
    injectCustomButton();
  
    // Optional: Set up a mutation observer to detect dynamic changes and reinject the button if needed
    const observer = new MutationObserver(injectCustomButton);
    observer.observe(document.body, { childList: true, subtree: true });
  });
  