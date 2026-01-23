
import React, { useRef } from 'react';

interface FileUploaderProps {
  label: string;
  description: string;
  onFileSelect: (content: string) => void;
  accept?: string;
}

const FileUploader: React.FC<FileUploaderProps> = ({ label, description, onFileSelect, accept = ".srt" }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        onFileSelect(content);
      };
      reader.readAsText(file);
    }
  };

  return (
    <div 
      onClick={() => fileInputRef.current?.click()}
      className="group relative border-2 border-dashed border-slate-700 rounded-xl p-6 transition-all hover:border-indigo-500 hover:bg-slate-800/40 cursor-pointer overflow-hidden"
    >
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        className="hidden" 
        accept={accept}
      />
      <div className="flex flex-col items-center text-center">
        <div className="w-12 h-12 mb-4 bg-slate-800 rounded-full flex items-center justify-center group-hover:bg-indigo-600/20 group-hover:scale-110 transition-transform">
          <svg className="w-6 h-6 text-slate-400 group-hover:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
        </div>
        <p className="font-medium text-slate-200">{label}</p>
        <p className="text-sm text-slate-500 mt-1">{description}</p>
      </div>
    </div>
  );
};

export default FileUploader;
