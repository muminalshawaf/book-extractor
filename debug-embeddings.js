// Debug script to test embedding generation
console.log("Testing embedding generation...");

// Test the backfill function
fetch('/functions/v1/backfill-embeddings', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVrem5zZWt5Z21pcG51Y3BvdW95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ2MjY4NzMsImV4cCI6MjA3MDIwMjg3M30.5gvy46gGEU-B9O3cutLNmLoX62dmEvKLC236yeaQ6So'
  },
  body: JSON.stringify({
    book_id: 'artificialintelligence12-1',
    force_regenerate: false,
    batch_size: 2
  })
})
.then(res => res.json())
.then(data => {
  console.log('Backfill response:', data);
})
.catch(err => {
  console.error('Backfill error:', err);
});