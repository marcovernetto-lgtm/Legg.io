export enum AppMode {
  EDITOR = 'EDITOR',
  PROMPTER = 'PROMPTER'
}

export interface ScriptConfig {
  fontSize: number;
  isMirrored: boolean;
  scrollSpeed: number; // For manual or auto assist
}

export interface SavedScript {
  id: string;
  title: string;
  content: string;
  lastModified: number;
}

// Web Speech API Types (since they aren't always fully typed in all TS configs)
export interface IWindow extends Window {
  webkitSpeechRecognition: any;
  SpeechRecognition: any;
}