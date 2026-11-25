import { useId, useState, type DragEvent } from 'react';
import { Icon } from './Icon.tsx';
import './FileDrop.css';

interface Props {
  accept: string;
  multiple?: boolean;
  label: string;
  hint: string;
  onFiles: (files: File[]) => void;
}

/** A real file input (keyboard and screen-reader native) wearing a drop target. */
export function FileDrop({ accept, multiple = true, label, hint, onFiles }: Props) {
  const id = useId();
  const [over, setOver] = useState(false);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    onFiles([...e.dataTransfer.files]);
  };
  return (
    <div
      className="drop"
      data-over={over || undefined}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <input
        id={id}
        className="visually-hidden"
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />
      <label htmlFor={id} className="drop-label">
        <Icon name="upload" size={28} />
        <span className="drop-title">{label}</span>
        <span className="drop-hint">{hint}</span>
      </label>
    </div>
  );
}
