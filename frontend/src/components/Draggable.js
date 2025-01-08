import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

export function Draggable(props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
    active
  } = useDraggable({
    id: props.id,
    data: props.data,
    disabled: props.disabled,
    attributes: {
      role: 'button',
      tabIndex: 0,
      'aria-label': props.ariaLabel || 'Draggable item',
      'aria-describedby': props.ariaDescribedBy,
      'aria-roledescription': 'draggable'
    }
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : undefined,
    cursor: isDragging ? 'grabbing' : props.disabled ? 'default' : 'grab',
    touchAction: 'none',
    ...props.style
  };

  return (
    <div 
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`draggable ${isDragging ? 'dragging' : ''} ${props.className || ''}`}
    >
      {props.children}
    </div>
  );
} 