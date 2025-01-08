import React from 'react';
import { useDroppable } from '@dnd-kit/core';

export function Droppable(props) {
  const { isOver, setNodeRef, active } = useDroppable({
    id: props.id,
    data: props.data,
    disabled: props.disabled,
    attributes: {
      role: 'button',
      'aria-label': props.ariaLabel || 'Droppable area',
      'aria-describedby': props.ariaDescribedBy,
      'aria-roledescription': 'droppable'
    }
  });

  const style = {
    ...props.style,
    transition: 'all 0.2s ease',
    transform: isOver ? 'scale(1.02)' : undefined,
    opacity: props.disabled ? 0.3 : isOver ? 1 : 0.8,
    borderColor: isOver ? 'rgba(255, 255, 255, 0.8)' : 'rgba(255, 255, 255, 0.3)',
    boxShadow: isOver ? '0 0 10px rgba(255, 255, 255, 0.3)' : undefined
  };

  return (
    <div 
      ref={setNodeRef}
      style={style}
      className={`droppable ${isOver ? 'over' : ''} ${props.className || ''}`}
      data-droppable-id={props.id}
    >
      {typeof props.children === 'function' ? props.children({ isOver, active }) : props.children}
    </div>
  );
} 