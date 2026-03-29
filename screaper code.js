async function scrapeAll() {
  const url = new URL(window.location.href);
  const container = document.createElement('div');
  
  container.style.backgroundColor = 'white';
  container.style.color = 'black';
  container.style.padding = '20px';
  container.style.fontFamily = 'sans-serif';
  
  document.body.innerHTML = '<h1 id="status" style="padding: 20px;">Fetching all pages, hang tight...</h1>';
  document.body.appendChild(container);

  let currentPage = 1;
  let lastPageContent = "";

  while (true) {
    console.log(`Loading page ${currentPage}...`);
    url.searchParams.set('filter[cpage]', currentPage);
    
    try {
      const res = await fetch(url.href);
      const text = await res.text();
      const doc = new DOMParser().parseFromString(text, 'text/html');
      
      const mainArea = doc.querySelector('td.block_content') || doc.body;
      const searchFilter = mainArea.querySelector('table.nounderlines');
      if (searchFilter) searchFilter.remove();
      
      mainArea.querySelectorAll('form').forEach(f => f.remove());
      
      const currentContent = mainArea.innerText.trim();
      // Break the loop if we hit an empty page or it just repeats the last page
      if (currentContent === lastPageContent || currentContent.length < 50) {
        console.log("Reached the end of the catalog.");
        break;
      }
      lastPageContent = currentContent;
      
      const divider = document.createElement('div');
      divider.innerHTML = `<br><hr style="border: 1px solid black;"><h2 style="color: blue;">Page ${currentPage}</h2><br>`;
      container.appendChild(divider);
      
      const courseWrapper = document.createElement('div');
      courseWrapper.innerHTML = mainArea.innerHTML;
      container.appendChild(courseWrapper);
      
      currentPage++;
    } catch (err) {
      console.error(`Failed on page ${currentPage}:`, err);
      break;
    }
  }
  
  // Clean up pagination text at the bottom
  document.querySelectorAll('a').forEach(link => {
    const text = link.innerText;
    if (text.includes('Contract All') || text.includes('Print this') || text.includes('Forward') || text.includes('Page:')) {
      link.remove();
    }
  });

  document.getElementById('status').innerText = 'Done! Press Ctrl+P to save as PDF.';
  console.log('Finished!');
}

scrapeAll();
