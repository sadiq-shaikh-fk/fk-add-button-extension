let userToken = null;

// Listen for sign-in event
chrome.runtime.onInstalled.addListener(() => {
  chrome.identity.getAuthToken({ interactive: true }, function(token) {
    userToken = token;
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'getToken') {
    sendResponse({ token: userToken });
  }
});
