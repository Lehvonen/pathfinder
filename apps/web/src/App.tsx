import { useState } from 'react';

const BACKGROUNDS = ['#ffffff', '#fde68a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#ddd6fe'];

function App() {
  const [index, setIndex] = useState(0);

  return (
    <main style={{ backgroundColor: BACKGROUNDS[index] }}>
      <h1>morrooo, här är vår app</h1>
      <button type="button" onClick={() => setIndex((i) => (i + 1) % BACKGROUNDS.length)}>
        Byt bakgrundsfärg
      </button>
    </main>
  );
}

export default App;
