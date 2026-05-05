import type { ReactNode } from 'react';
import './BottomSheet.css';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function BottomSheet({ isOpen, onClose, children }: BottomSheetProps) {
  return (
    <div className={`bottom-sheet${isOpen ? ' bottom-sheet--open' : ''}`}>
      <div className="bottom-sheet__backdrop" onClick={onClose} />
      <div className="bottom-sheet__content">
        <div className="bottom-sheet__handle" onClick={onClose}>
          <span className="bottom-sheet__handle-bar" />
        </div>
        {children}
      </div>
    </div>
  );
}
