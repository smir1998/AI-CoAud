import { useState } from 'react';
import { CodingAssistant } from './components/CodingAssistant';
import { MantisSecurityReview } from './components/MantisSecurityReview';
import './components/CodingAssistant.css';
import './components/MantisSecurityReview.css';

export default function App() {
  const [activeTool, setActiveTool] = useState<'coding' | 'security'>('security');

  return (
    <div style={{ height: '100vh', padding: '2rem' }}>
      <div style={{ marginBottom: '1rem', display: 'flex', gap: '1rem' }}>
        <button
          onClick={() => setActiveTool('coding')}
          style={{
            padding: '0.5rem 1rem',
            background: activeTool === 'coding' ? 'var(--accent-color)' : 'var(--bg-secondary)',
            color: activeTool === 'coding' ? 'white' : 'var(--text-primary)',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          💻 Coding Assistant
        </button>
        <button
          onClick={() => setActiveTool('security')}
          style={{
            padding: '0.5rem 1rem',
            background: activeTool === 'security' ? 'var(--accent-color)' : 'var(--bg-secondary)',
            color: activeTool === 'security' ? 'white' : 'var(--text-primary)',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          🔍 Mantis Security Review
        </button>
      </div>
      
      {activeTool === 'coding' ? <CodingAssistant /> : <MantisSecurityReview />}
    </div>
  );
}
