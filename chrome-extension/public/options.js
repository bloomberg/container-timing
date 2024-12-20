// Saves options to chrome.storage
const saveOptions = () => {
  const selector = document.getElementById('selector').value ?? 'html';
  console.log(selector);

  chrome.storage.sync.set(
    { selector },
    () => {
      // Update status to let user know options were saved.
      const status = document.getElementById('status');
      status.textContent = 'Options saved.';
      setTimeout(() => {
        status.textContent = '';
      }, 1000);
    }
  );
};

// Restores select box and checkbox state using the preferences
// stored in chrome.storage.
const restoreOptions = () => {
  chrome.storage.sync.get(
    {selector: 'html'},
    (items) => {
      console.log(items);
      // When selector hasn't been set it's not false or empty, but just an empty object (I don't know why)
      document.getElementById('selector').value = items.selector;
    }
  );
};

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save').addEventListener('click', saveOptions);
