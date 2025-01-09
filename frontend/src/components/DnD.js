import React from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

export function Draggable(props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging
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

