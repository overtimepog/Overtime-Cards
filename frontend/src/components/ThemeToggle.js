import React from 'react';
import { useTheme } from '../context/ThemeContext';

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="theme-toggle"
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
      title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
      style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        background: 'none',
        border: 'none',
        color: 'var(--text-color)',
        fontSize: '24px',
        cursor: 'pointer',
        padding: '8px',
        borderRadius: '50%',
        width: '40px',
        height: '40px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background-color 0.3s, transform 0.2s',
        backgroundColor: 'var(--background-color)',
        boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
        zIndex: 1000,
      }}
      onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
      onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
    >
      {theme === 'light' ? '☀️' : '🌙'}
    </button>
  );
}

export default ThemeToggle; 