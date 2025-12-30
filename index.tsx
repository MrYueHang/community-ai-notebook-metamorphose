import React, { useState, useRef, useEffect, useMemo, Suspense, memo, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI } from "@google/genai";
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Text, Float, Stars, Grid, Environment, MeshReflectorMaterial, useTexture, Line, Html, Billboard } from '@react-three/drei';
import * as THREE from 'three';

// --- GLOBAL & TYPES ---
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

const APP_CONFIG = {
    version: '4.4.0-Lumina-Governance',
    env: 'production',
    simulationMode: true, 
};

// --- ERROR BOUNDARY ---
interface ErrorBoundaryProps {
  children?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };
  public props: ErrorBoundaryProps;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.props = props;
  }

  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  
  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-full bg-slate-900 flex flex-col items-center justify-center text-white p-8 font-mono">
          <div className="text-red-500 text-4xl mb-4">⚠ SYSTEM CRITICAL ⚠</div>
          <div className="bg-black/50 p-4 rounded border border-red-500/30 max-w-lg overflow-auto text-red-300">
            {this.state.error?.toString()}
          </div>
          <button onClick={() => window.location.reload()} className="mt-8 px-6 py-2 bg-indigo-600 hover:bg-indigo-500 rounded font-bold tracking-widest">REBOOT SYSTEM</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- TRANSLATIONS (i18n) ---
const TRANSLATIONS = {
  de: {
    nav: { home: 'Campus Core', chat: 'Neural Chat', studio: 'Creative Studio', files: 'Archive', notes: 'Mind Palace', tickets: 'Quests', growth: 'Skill Tree', admin: 'Admin Tower' },
    auth: { title: 'Lumina OS Zugang', wallet_btn: 'Wallet Connect', guest_btn: 'Gast Modus', connecting: 'Verbinde...' },
    tokens: { rep: 'XP', act: 'Focus', edu: 'Wissen' },
    placeholders: { chat: 'Befehl eingeben...', search_sources: 'Wissen durchsuchen...' },
    actions: { summarize: 'Zusammenfassen', workflow: 'Workflow', next_step: 'Nächster Schritt' },
    meta: { controls: 'WASD: Bewegen • E: Interagieren', loading: 'Lade Module...' },
    governance: { title: 'Ops Center', agents: 'Agent Swarm', quick_actions: 'Quick Actions' }
  },
  en: {
    nav: { home: 'Campus Core', chat: 'Neural Chat', studio: 'Creative Studio', files: 'Archive', notes: 'Mind Palace', tickets: 'Quests', growth: 'Skill Tree', admin: 'Admin Tower' },
    auth: { title: 'Lumina OS Access', wallet_btn: 'Connect Wallet', guest_btn: 'Guest Mode', connecting: 'Connecting...' },
    tokens: { rep: 'XP', act: 'Focus', edu: 'Knowledge' },
    placeholders: { chat: 'Enter command...', search_sources: 'Search knowledge...' },
    actions: { summarize: 'Summarize', workflow: 'Workflow', next_step: 'Next Step' },
    meta: { controls: 'WASD: Move • E: Interact', loading: 'Loading Modules...' },
    governance: { title: 'Ops Center', agents: 'Agent Swarm', quick_actions: 'Quick Actions' }
  }
};

// --- DATA MODELS ---
type User = { 
    id: string; 
    name: string; 
    avatar: string; 
    role: 'Scholar' | 'Mentor' | 'Pioneer'; 
    tokens: { rep: number; act: number; edu: number; }; 
};

type Message = { 
    id: number; 
    role: 'user' | 'model'; 
    text: string; 
    isStreaming?: boolean; 
    feedback?: 'up' | 'down';
    feedbackComment?: string;
};

type Agent = {
    id: string;
    name: string;
    role: string;
    status: 'Active' | 'Idle' | 'Learning' | 'Optimizing';
    connectionQuality: 'optimal' | 'unstable' | 'offline'; 
    type: 'security' | 'analyst' | 'creative' | 'manager';
    load: number;
    energy: number;
    cooldown: number;
    currentTask: string; // AI Suggested
    zoneId: string;
    position?: THREE.Vector3;
};

type IntegrationType = 'whatsapp' | 'telegram' | 'viber';
type IntegrationEvent = { id: string; type: IntegrationType; message: string; handled: boolean; timestamp: number };
type Source = { id: string; title: string; type: string; content: string; };
type FileNode = { id: string; parentId: string | null; name: string; type: 'folder' | 'file'; size: string; date: string; perm: string; };
type Note = { id: string; title: string; content: string; updatedAt: number; links: string[]; };
type Extension = { id: string; name: string; description: string; version: string; installed: boolean; category: string; };
type GovernanceInitiative = { id: string; title: string; active: boolean; };

// --- ICONS ---
const Icons = {
    Cpu: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/></svg>,
    Activity: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
    Wallet: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>,
    Terminal: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>,
    Brain: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/></svg>,
    Send: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
    Search: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
    Cloud: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>,
    Mic: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>,
    Wand: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 2a2 2 0 0 1 0 9 2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h12z"/><path d="m8 2 4 4"/><path d="m2 8 4-4"/><line x1="16" y1="14" x2="22" y2="20"/><line x1="16" y1="20" x2="22" y2="14"/></svg>,
    Plus: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
    Folder: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>,
    FileText: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
    Trash: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
    Download: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
    ArrowUp: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>,
    X: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
    Edit: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
    Users: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    Link: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
    Code: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>,
    Spark: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>,
    Filter: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
    HardDrive: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="12" x2="2" y2="12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><line x1="6" y1="16" x2="6.01" y2="16"/><line x1="10" y1="16" x2="10.01" y2="16"/></svg>,
    Git: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>,
    MessageCircle: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>,
    ThumbsUp: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>,
    ThumbsDown: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2"/></svg>,
    Phone: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,
    Settings: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
    Check: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>,
    Wifi: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>,
    WifiOff: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.58 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>
};

// --- SERVICE LAYER ---
class BackendService {
    static async login(method: 'wallet' | 'guest'): Promise<User> {
        await new Promise(r => setTimeout(r, 800)); 
        return {
            id: 'u_01', name: method === 'wallet' ? 'Neo Scholar' : 'Guest Student', avatar: '🎓', role: 'Scholar',
            tokens: { rep: 1250, act: 85, edu: 42 }
        };
    }

    static async syncData() {
        return {
            sources: [
                { id: 's1', title: 'Calculus 101 Notes', type: 'pdf', content: 'Derivatives...' },
            ],
            agents: [
                { id: 'a1', name: 'Logic-Bot', role: 'Tutor', status: 'Active', connectionQuality: 'optimal', type: 'analyst', load: 45, energy: 90, cooldown: 0, currentTask: 'Calculating', zoneId: 'dashboard' },
                { id: 'a2', name: 'Muse', role: 'Artist', status: 'Idle', connectionQuality: 'unstable', type: 'creative', load: 10, energy: 40, cooldown: 30, currentTask: 'Dreaming', zoneId: 'studio' },
                { id: 'a3', name: 'Archivist', role: 'Librarian', status: 'Optimizing', connectionQuality: 'optimal', type: 'manager', load: 80, energy: 65, cooldown: 0, currentTask: 'Indexing', zoneId: 'files' },
                { id: 'a4', name: 'Sentinel', role: 'Flow Guard', status: 'Active', connectionQuality: 'offline', type: 'security', load: 60, energy: 80, cooldown: 10, currentTask: 'Patrol', zoneId: 'chat' }
            ],
            extensions: [
                { id: 'e1', name: 'WhatsApp Bridge', description: 'Route messages to agents.', version: '1.0', installed: true, category: 'plugin' },
                { id: 'e2', name: 'Telegram Bot', description: 'BotFather integration.', version: '0.9', installed: true, category: 'plugin' },
                { id: 'e3', name: 'Viber Connect', description: 'Community management.', version: '0.5', installed: false, category: 'plugin' },
                { id: 'e4', name: 'GitHub Sync', description: 'Auto-commit code changes.', version: '2.1', installed: false, category: 'dev' },
                { id: 'e5', name: 'Notion Import', description: 'Sync workspace docs.', version: '1.2', installed: false, category: 'productivity' }
            ],
            initiatives: [
                { id: 'i1', title: 'Sustainability 2025', active: true },
                { id: 'i2', title: 'GDPR Compliance', active: false },
                { id: 'i3', title: 'Campus Diversity', active: true },
                { id: 'i4', title: 'Budget Optimization', active: false }
            ]
        };
    }
}

// --- 3D COMPONENTS (Advanced) ---
const AgentAvatar3D: React.FC<{ position: THREE.Vector3, color: string, task: string, targetPosition?: THREE.Vector3 }> = ({ position, color, task, targetPosition }) => {
    const ref = useRef<THREE.Group>(null);
    useFrame((state) => {
        if(ref.current) {
            ref.current.position.lerp(position, 0.05);
            ref.current.position.y = 1 + Math.sin(state.clock.elapsedTime * 3) * 0.1;
        }
    });
    return (
        <group ref={ref} position={position}>
            {/* AI Task Suggestion Billboard */}
            <Billboard position={[0, 1.5, 0]} follow={true} lockX={false} lockY={false} lockZ={false}>
                 <Text fontSize={0.25} color="white" anchorX="center" anchorY="middle" outlineWidth={0.02} outlineColor="#000000">
                    {task}
                 </Text>
            </Billboard>
            <mesh>
                <sphereGeometry args={[0.4, 16, 16]} />
                <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8} />
            </mesh>
            <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, -0.4, 0]}>
                <ringGeometry args={[0.5, 0.6, 32]} />
                <meshBasicMaterial color={color} opacity={0.5} transparent />
            </mesh>
            {/* Visual Path Prediction */}
            {targetPosition && <Line points={[new THREE.Vector3(0,0,0), targetPosition.clone().sub(position)]} color={color} opacity={0.5} transparent dashed dashScale={2} dashSize={0.5} gapSize={0.2} />}
        </group>
    );
};

// Interaction Pulse Line
const InteractionLine: React.FC<{ start: THREE.Vector3; end: THREE.Vector3 }> = ({ start, end }) => {
    const ref = useRef<any>(null);
    useFrame((state) => {
        if (ref.current && ref.current.material) {
            ref.current.material.dashOffset -= 0.02; // Pulsating animation
        }
    });
    return <Line ref={ref} points={[start, end]} color="cyan" opacity={0.6} transparent dashed dashScale={1} dashSize={1} gapSize={0.5} lineWidth={2} />;
};

const AgentSwarm3D = memo(({ agents }: { agents: Agent[] }) => {
    const zonePositions: {[key: string]: [number, number, number]} = useMemo(() => ({
        'dashboard': [0, 0, 0], 'studio': [-12, 0, -5], 'files': [12, 0, -5], 'chat': [0, 0, -15],
    }), []);

    // Proximity Interactions with Logic Check
    const interactions = useMemo(() => {
        const lines: {s: THREE.Vector3, e: THREE.Vector3, key: string}[] = [];
        agents.forEach((a1, i) => {
             const zp1 = zonePositions[a1.zoneId] || [0,0,0];
             const p1 = new THREE.Vector3(zp1[0] + Math.cos(i)*3, 1, zp1[2] + Math.sin(i)*3);
             agents.forEach((a2, j) => {
                 if (i < j) {
                    const zp2 = zonePositions[a2.zoneId] || [0,0,0];
                    const p2 = new THREE.Vector3(zp2[0] + Math.cos(j)*3, 1, zp2[2] + Math.sin(j)*3);
                    
                    // Task Compatibility Logic
                    const compatible = (a1.type === 'analyst' && a2.type === 'manager') || (a1.type === 'creative' && a2.type === 'creative');
                    
                    if (p1.distanceTo(p2) < 15 && compatible) {
                        lines.push({ s: p1, e: p2, key: `${a1.id}-${a2.id}` });
                    }
                 }
             });
        });
        return lines;
    }, [agents, zonePositions]);

    return (
        <group>
            {agents.map((agent, i) => {
                const basePos = zonePositions[agent.zoneId] || [0, 0, 0];
                const angle = (Date.now() * 0.0005) + (i * (Math.PI * 2 / agents.length));
                const currentPos = new THREE.Vector3(basePos[0] + Math.cos(angle)*3, 1, basePos[2] + Math.sin(angle)*3);
                const targetPos = new THREE.Vector3(basePos[0], 1, basePos[2]);
                
                return <AgentAvatar3D key={agent.id} position={currentPos} color={agent.type === 'security' ? '#ef4444' : agent.type === 'creative' ? '#a855f7' : '#3b82f6'} task={agent.currentTask} targetPosition={targetPos} />;
            })}
            {interactions.map(line => <InteractionLine key={line.key} start={line.s} end={line.e} />)}
        </group>
    );
});

const Building = ({ position, color, label, type, onEnter, agentCount = 0, onHoverZone }: any) => {
    const meshRef = useRef<THREE.Mesh>(null);
    const auraRef = useRef<THREE.Mesh>(null);
    const [hovered, setHovered] = useState(false);
    const [summary, setSummary] = useState<string | null>(null);

    useFrame((state) => {
        // Visual Effect: Pulse scale based on agent count
        const pulse = 1 + Math.sin(state.clock.elapsedTime * 2) * (0.05 + agentCount * 0.05); // More intense scaling
        if (meshRef.current) meshRef.current.scale.setScalar(pulse);
        if (auraRef.current) {
            auraRef.current.rotation.z += 0.01;
            auraRef.current.scale.setScalar(1 + agentCount * 0.3); 
            // @ts-ignore
            auraRef.current.material.opacity = 0.2 + (agentCount * 0.1);
        }
    });

    const handlePointerOver = useCallback(() => {
        setHovered(true);
        if (!summary) onHoverZone(type).then(setSummary); // AI Lazy Load
    }, [summary, type, onHoverZone]);

    return (
        <group position={position} onPointerOver={handlePointerOver} onPointerOut={() => setHovered(false)}>
            <mesh ref={meshRef} position={[0, 3, 0]}>
                <boxGeometry args={[5, 6, 5]} />
                <meshStandardMaterial color={color} metalness={0.7} roughness={0.2} emissive={color} emissiveIntensity={agentCount > 0 ? 0.3 + (agentCount * 0.2) : 0.1} />
            </mesh>
            <mesh ref={auraRef} rotation={[-Math.PI/2, 0, 0]} position={[0, 0.1, 0]}>
                <ringGeometry args={[4, 7, 32]} />
                <meshBasicMaterial color={color} transparent opacity={0.3} />
            </mesh>
            <Text position={[0, 7, 0]} fontSize={0.8} color="white" anchorX="center">{label}</Text>
            {hovered && (
                <Html position={[0, 5, 0]} center distanceFactor={15} style={{pointerEvents: 'none'}}>
                    <div className="bg-black/80 backdrop-blur text-white p-3 rounded-lg border border-indigo-500 w-64 text-xs font-mono shadow-[0_0_15px_rgba(99,102,241,0.5)] z-50">
                        <div className="font-bold text-indigo-400 mb-1 flex items-center gap-2"><Icons.Activity/> AI Zone Analysis</div>
                        <div className="mb-2 flex justify-between">
                            <span>Agents Active:</span>
                            <span className="font-bold text-white">{agentCount}</span>
                        </div>
                        <div className="text-gray-300 italic animate-pulse border-t border-gray-700 pt-2">
                            {summary || "Analyzing neural activity..."}
                        </div>
                    </div>
                </Html>
            )}
        </group>
    );
};

const MetaScene = ({ systemHealth, agents, onGetZoneSummary }: { systemHealth: number, agents: Agent[], onGetZoneSummary: (zone: string) => Promise<string> }) => {
    const getAgentCount = (zone: string) => agents.filter(a => a.zoneId === zone).length;

    return (
        <>
            <ambientLight intensity={0.3} />
            <pointLight position={[10, 10, 10]} intensity={1} color="#4f46e5" />
            <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
                <planeGeometry args={[100, 100]} />
                <MeshReflectorMaterial blur={[300, 100]} resolution={1024} mixBlur={1} mixStrength={50} roughness={1} depthScale={1.2} minDepthThreshold={0.4} maxDepthThreshold={1.4} color="#0f172a" metalness={0.5} mirror={0} />
            </mesh>
            <Grid infiniteGrid sectionSize={1} cellSize={1} cellColor="#3b82f6" sectionColor="#1d4ed8" fadeDistance={30} />
            
            <Building position={[0, 0, 0]} color="#4f46e5" label="Governance Core" type="dashboard" agentCount={getAgentCount('dashboard')} onHoverZone={onGetZoneSummary} />
            <Building position={[-15, 0, -5]} color="#ec4899" label="Creative Studio" type="studio" agentCount={getAgentCount('studio')} onHoverZone={onGetZoneSummary} />
            <Building position={[15, 0, -5]} color="#10b981" label="Data Archive" type="files" agentCount={getAgentCount('files')} onHoverZone={onGetZoneSummary} />
            <Building position={[0, 0, -20]} color="#f59e0b" label="Chat Nexus" type="chat" agentCount={getAgentCount('chat')} onHoverZone={onGetZoneSummary} />

            <AgentSwarm3D agents={agents} />
        </>
    );
};

// --- 2D UI COMPONENTS ---

const Header = ({ user, integrations, agents }: { user: User, integrations: string[], agents: Agent[] }) => {
    const [showStatus, setShowStatus] = useState(false);

    return (
        <div className="h-16 bg-white/90 backdrop-blur border-b border-slate-200 flex items-center justify-between px-6 shadow-sm z-10 shrink-0 relative">
            <div className="flex items-center gap-3">
            <div className="bg-indigo-600 text-white p-2 rounded-lg shadow-lg shadow-indigo-500/30"><Icons.Brain /></div>
            <div>
                <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Lumina OS</div>
                <div className="font-bold text-slate-800">{user.role} <span className="text-indigo-600">Level 4</span></div>
            </div>
            </div>
            <div className="flex items-center gap-6">
                <div className="relative">
                    <button 
                        onClick={() => setShowStatus(!showStatus)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors text-xs font-bold text-slate-600"
                    >
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                        </span>
                        Agent Status
                    </button>
                    {showStatus && (
                        <div className="absolute top-10 right-0 w-64 bg-white rounded-xl shadow-xl border border-slate-200 p-3 z-50">
                            <h4 className="text-xs font-bold text-slate-400 uppercase mb-2">Network Health</h4>
                            <div className="space-y-2">
                                {agents.map(agent => (
                                    <div key={agent.id} className="flex justify-between items-center text-sm">
                                        <div className="flex items-center gap-2">
                                            <div className={`w-2 h-2 rounded-full ${agent.connectionQuality === 'optimal' ? 'bg-green-500' : agent.connectionQuality === 'unstable' ? 'bg-yellow-500' : 'bg-red-500'}`}></div>
                                            <span className="text-slate-700 font-medium">{agent.name}</span>
                                        </div>
                                        <span className="text-xs text-slate-400">{agent.connectionQuality}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="hidden md:flex gap-2">
                    <div className={`p-1.5 rounded-full ${integrations.includes('whatsapp') ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-300'}`} title="WhatsApp"><Icons.Phone /></div>
                    <div className={`p-1.5 rounded-full ${integrations.includes('telegram') ? 'bg-blue-100 text-blue-500' : 'bg-slate-100 text-slate-300'}`} title="Telegram"><Icons.Send /></div>
                </div>
                <div className="flex gap-4">
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] uppercase font-bold text-slate-400">XP</span>
                        <span className="text-xl font-black text-indigo-600">{user.tokens.rep}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

const AIClassifier = ({ initiatives, onClassify }: { initiatives: GovernanceInitiative[], onClassify: (text: string, context: string[]) => Promise<string> }) => {
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [input, setInput] = useState("");
    const [result, setResult] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    const handleClassify = async () => {
        if (!input.trim()) return;
        setIsProcessing(true);
        const contextTitles = initiatives.filter(i => selectedIds.includes(i.id)).map(i => i.title);
        const res = await onClassify(input, contextTitles);
        setResult(res);
        setIsProcessing(false);
    };

    return (
        <div className="h-full flex flex-col p-6 overflow-hidden">
            <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2"><Icons.Brain /> Governance Classifier</h2>
            <div className="grid grid-cols-3 gap-6 h-full">
                <div className="col-span-1 bg-white border border-slate-200 rounded-xl p-4 overflow-y-auto">
                    <h3 className="text-sm font-bold text-slate-500 uppercase mb-3">Active Context</h3>
                    <div className="space-y-2">
                        {initiatives.map(init => (
                            <label key={init.id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${selectedIds.includes(init.id) ? 'bg-indigo-50 border-indigo-500' : 'bg-slate-50 border-slate-200 hover:border-indigo-300'}`}>
                                <input 
                                    type="checkbox" 
                                    checked={selectedIds.includes(init.id)} 
                                    onChange={() => setSelectedIds(prev => prev.includes(init.id) ? prev.filter(id => id !== init.id) : [...prev, init.id])}
                                    className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                />
                                <span className="text-sm font-medium text-slate-700">{init.title}</span>
                            </label>
                        ))}
                    </div>
                </div>
                <div className="col-span-2 flex flex-col gap-4">
                    <textarea 
                        className="flex-1 w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-700 resize-none focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-sm"
                        placeholder="Paste governance text, policy draft, or ticket content here for AI analysis..."
                        value={input}
                        onChange={e => setInput(e.target.value)}
                    />
                    <div className="flex justify-end">
                        <button 
                            onClick={handleClassify} 
                            disabled={isProcessing}
                            className={`px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold flex items-center gap-2 transition-all ${isProcessing ? 'opacity-70 cursor-wait' : 'hover:bg-indigo-700'}`}
                        >
                            {isProcessing ? 'Analyzing...' : <><Icons.Spark /> Classify Content</>}
                        </button>
                    </div>
                    {result && (
                        <div className="bg-slate-900 text-green-400 p-4 rounded-xl font-mono text-sm border-l-4 border-green-500 overflow-y-auto max-h-40 shadow-lg">
                            <div className="font-bold mb-1 text-white">AI ANALYSIS RESULT:</div>
                            {result}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const ToolRegistry = ({ tools, onInstall }: { tools: Extension[], onInstall: (id: string) => void }) => {
    return (
        <div className="p-6 h-full overflow-y-auto">
            <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2"><Icons.Settings /> Tool Registry</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {tools.map(tool => (
                    <div key={tool.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
                        {tool.installed && <div className="absolute top-0 right-0 bg-green-500 text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg"><Icons.Check /></div>}
                        <div className="flex justify-between items-start mb-3">
                            <div className="bg-slate-100 p-3 rounded-lg text-indigo-600">
                                {tool.category === 'plugin' ? <Icons.Cpu /> : tool.category === 'dev' ? <Icons.Git /> : <Icons.Activity />}
                            </div>
                            <span className="text-xs font-mono text-slate-400 bg-slate-50 px-2 py-1 rounded">{tool.version}</span>
                        </div>
                        <h3 className="font-bold text-slate-800 mb-1">{tool.name}</h3>
                        <p className="text-sm text-slate-500 mb-4 h-10">{tool.description}</p>
                        <button 
                            onClick={() => onInstall(tool.id)}
                            className={`w-full py-2 rounded-lg font-bold text-sm transition-all ${tool.installed ? 'bg-slate-100 text-slate-400 cursor-default' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200'}`}
                        >
                            {tool.installed ? 'Installed' : 'Install Module'}
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};

const BoardAgents = ({ agents, chats, onChatStart, onFeedback }: { agents: Agent[], chats: Record<string, Message[]>, onChatStart: (agent: Agent, query: string) => void, onFeedback: (agentId: string, msgId: number, type: 'up'|'down', comment: string) => void }) => {
    const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [feedbackInput, setFeedbackInput] = useState<{msgId: number, type: 'up'|'down'} | null>(null);
    const [feedbackComment, setFeedbackComment] = useState("");
    
    const selectedAgent = agents.find(a => a.id === selectedAgentId);
    const currentChat = selectedAgentId ? chats[selectedAgentId] || [] : [];
    const [isThinking, setIsThinking] = useState(false);

    const handleSubmit = () => {
        if (!selectedAgent || !query.trim()) return;
        setIsThinking(true);
        onChatStart(selectedAgent, query);
        setQuery('');
        setTimeout(() => setIsThinking(false), 1500); 
    };

    const submitFeedback = () => {
        if(selectedAgentId && feedbackInput) {
            onFeedback(selectedAgentId, feedbackInput.msgId, feedbackInput.type, feedbackComment);
            setFeedbackInput(null);
            setFeedbackComment("");
        }
    }

    return (
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6 h-[500px]">
            <div className={`bg-white p-6 rounded-xl shadow-sm border border-slate-200 overflow-y-auto ${selectedAgentId ? 'hidden lg:block' : ''}`}>
                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Icons.Users /> Agent Swarm</h3>
                <div className="space-y-3">
                    {agents.map(agent => (
                        <div key={agent.id} onClick={() => setSelectedAgentId(agent.id)} className={`p-3 border rounded-lg cursor-pointer transition-all ${selectedAgentId === agent.id ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500' : 'border-slate-100 bg-white hover:border-indigo-300'}`}>
                            <div className="flex justify-between items-center mb-1">
                                <div className="font-bold text-slate-700">{agent.name}</div>
                                <div className="flex items-center gap-1.5">
                                    <span className={`w-2 h-2 rounded-full ${agent.connectionQuality === 'optimal' ? 'bg-green-500 animate-pulse' : agent.connectionQuality === 'unstable' ? 'bg-amber-500' : 'bg-red-500'}`}></span>
                                </div>
                            </div>
                            <div className="text-xs text-slate-500 flex justify-between">
                                <span>{agent.role}</span>
                                <span className={agent.status === 'Active' ? 'text-green-600 font-bold' : 'text-slate-400'}>{agent.status}</span>
                            </div>
                             <div className="text-[10px] text-indigo-400 mt-1 italic truncate">Task: {agent.currentTask}</div>
                        </div>
                    ))}
                </div>
            </div>
            <div className={`col-span-2 bg-slate-900 rounded-xl border border-slate-800 flex flex-col overflow-hidden ${!selectedAgentId ? 'hidden lg:flex' : 'flex'}`}>
                {selectedAgent ? (
                    <>
                        <div className="p-4 border-b border-slate-700 bg-slate-800/50 flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <div className={`w-3 h-3 rounded-full ${selectedAgent.connectionQuality === 'optimal' ? 'bg-green-400' : 'bg-red-400'}`}></div>
                                <span className="text-white font-mono font-bold">UPLINK: {selectedAgent.name}</span>
                            </div>
                            <button onClick={() => setSelectedAgentId(null)} className="lg:hidden text-slate-400 hover:text-white"><Icons.X /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                            {currentChat.length === 0 && <div className="text-slate-500 text-center text-sm mt-10 italic">Secure channel established.</div>}
                            {currentChat.map(msg => (
                                <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                    <div className={`max-w-[80%] rounded-xl p-3 text-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-200 border border-slate-700'}`}>
                                        {msg.text}
                                        {msg.role === 'model' && (
                                            <div className="mt-2 flex flex-col gap-2 pt-2 border-t border-slate-700/50">
                                                {msg.feedback ? (
                                                     <div className="text-xs text-slate-400 flex items-center gap-1">
                                                        Feedback: {msg.feedback === 'up' ? '👍' : '👎'} {msg.feedbackComment && `"${msg.feedbackComment}"`}
                                                     </div>
                                                ) : (
                                                    feedbackInput?.msgId === msg.id ? (
                                                        <div className="flex gap-2">
                                                            <input 
                                                                className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-white flex-1"
                                                                placeholder="Add comment (optional)..."
                                                                value={feedbackComment}
                                                                onChange={e => setFeedbackComment(e.target.value)}
                                                                autoFocus
                                                            />
                                                            <button onClick={submitFeedback} className="text-xs bg-green-600 text-white px-2 rounded">OK</button>
                                                        </div>
                                                    ) : (
                                                        <div className="flex justify-end gap-2">
                                                            <button onClick={() => setFeedbackInput({msgId: msg.id, type: 'up'})} className="hover:text-green-400 text-slate-500"><Icons.ThumbsUp /></button>
                                                            <button onClick={() => setFeedbackInput({msgId: msg.id, type: 'down'})} className="hover:text-red-400 text-slate-500"><Icons.ThumbsDown /></button>
                                                        </div>
                                                    )
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {isThinking && <div className="text-indigo-400 text-xs animate-pulse ml-2">Agent processing data packet...</div>}
                        </div>
                        <div className="p-4 bg-slate-800/50 border-t border-slate-700 flex gap-2">
                            <input className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white text-sm outline-none focus:border-indigo-500" placeholder={`Query ${selectedAgent.name}...`} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
                            <button onClick={handleSubmit} className="bg-indigo-600 hover:bg-indigo-500 text-white p-2 rounded-lg transition-colors"><Icons.Send /></button>
                        </div>
                    </>
                ) : <div className="flex items-center justify-center h-full text-slate-600 font-mono">Select an Agent to establish uplink.</div>}
            </div>
        </div>
    );
};

const QuickActionsPanel = ({ onAction, t }: { onAction: (action: string) => void, t: (key: string) => string }) => (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Icons.Wand /> {t('governance.quick_actions')}</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <button onClick={() => onAction('summarize')} className="flex flex-col items-center justify-center p-4 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 rounded-lg transition-all group">
                <div className="text-slate-400 group-hover:text-indigo-600 mb-2"><Icons.FileText /></div>
                <span className="text-xs font-bold text-slate-600 group-hover:text-indigo-700">{t('actions.summarize')}</span>
            </button>
            <button onClick={() => onAction('workflow')} className="flex flex-col items-center justify-center p-4 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 rounded-lg transition-all group">
                <div className="text-slate-400 group-hover:text-indigo-600 mb-2"><Icons.Git /></div>
                <span className="text-xs font-bold text-slate-600 group-hover:text-indigo-700">{t('actions.workflow')}</span>
            </button>
        </div>
    </div>
);

// --- APP ---
const App = () => {
    const [user, setUser] = useState<User|null>(null);
    const [activeTab, setActiveTab] = useState('dashboard');
    const [agents, setAgents] = useState<Agent[]>([]);
    const [integrations, setIntegrations] = useState<string[]>(['whatsapp', 'telegram']);
    const [agentChats, setAgentChats] = useState<Record<string, Message[]>>({});
    const [integrationEvents, setIntegrationEvents] = useState<IntegrationEvent[]>([]);
    const [zoneSummaries, setZoneSummaries] = useState<Record<string, string>>({});
    
    // New State for Features
    const [initiatives, setInitiatives] = useState<GovernanceInitiative[]>([]);
    const [extensions, setExtensions] = useState<Extension[]>([]);

    useEffect(() => {
        BackendService.login('wallet').then(u => {
            setUser(u);
            BackendService.syncData().then(d => {
                setAgents(d.agents as Agent[]);
                setInitiatives(d.initiatives);
                setExtensions(d.extensions);
            });
        });
    }, []);

    // Simulation Loop
    useEffect(() => {
        if (!user) return;
        const interval = setInterval(() => {
            // Random Integration Events
            if (Math.random() > 0.95) {
                const types: IntegrationType[] = ['whatsapp', 'telegram', 'viber'];
                const type = types[Math.floor(Math.random() * types.length)];
                if (integrations.includes(type)) {
                    const newEvent: IntegrationEvent = { id: Date.now().toString(), type, message: `Incoming ${type} query.`, handled: false, timestamp: Date.now() };
                    setIntegrationEvents(prev => [newEvent, ...prev]);
                    setTimeout(() => {
                        setIntegrationEvents(prev => prev.map(e => e.id === newEvent.id ? { ...e, handled: true } : e));
                        setUser(u => u ? ({ ...u, tokens: { ...u.tokens, rep: u.tokens.rep + 5 } }) : null);
                    }, 3000);
                }
            }
            
            // Agent Status Simulation
            setAgents(prev => prev.map(a => {
                const tasks = {
                    'analyst': ['Solving Eq.', 'Data Mining', 'Checking Regs'],
                    'creative': ['Sketching', 'Color Grading', 'Ideation'],
                    'manager': ['Indexing', 'Sorting', 'Archiving'],
                    'security': ['Patrol', 'Firewalling', 'Scanning']
                };
                const taskList = tasks[a.type as keyof typeof tasks] || ['Thinking'];
                // Energy Logic: Agents get tired and need to recharge
                let newEnergy = a.energy - 1;
                let newTask = a.currentTask;
                let newStatus = a.status;

                if (newEnergy < 20) {
                     newTask = "Recharging";
                     newStatus = "Idle";
                     newEnergy += 5; // Recharge faster if idle
                } else if (Math.random() > 0.7) {
                     newTask = taskList[Math.floor(Math.random() * taskList.length)];
                     newStatus = "Active";
                }

                return {
                    ...a,
                    energy: Math.min(100, newEnergy),
                    currentTask: newTask,
                    status: newStatus as any,
                    connectionQuality: Math.random() > 0.9 ? (Math.random() > 0.5 ? 'unstable' : 'offline') : 'optimal', 
                };
            }));
        }, 2000);
        return () => clearInterval(interval);
    }, [user, integrations]);

    const getZoneSummary = useCallback(async (zone: string): Promise<string> => {
        if (zoneSummaries[zone]) return zoneSummaries[zone]; 
        try {
            if(!process.env.API_KEY) return "AI Offline";
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const result = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: [{ role: 'user', parts: [{ text: `Generate a 1-sentence summary of simulated activity in the ${zone} zone of a digital university.` }] }]
            });
            const text = result.text || "No activity detected.";
            setZoneSummaries(prev => ({...prev, [zone]: text}));
            return text;
        } catch(e) { return "Analysis Failed"; }
    }, [zoneSummaries]);

    const handleAgentChat = async (agent: Agent, query: string) => {
        const userMsg: Message = { id: Date.now(), role: 'user', text: query };
        setAgentChats(prev => ({ ...prev, [agent.id]: [...(prev[agent.id] || []), userMsg] }));
        try {
            if(!process.env.API_KEY) throw new Error("No API Key");
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const result = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: [{ role: 'user', parts: [{ text: `Act as agent ${agent.name} (${agent.role}). User says: ${query}` }] }]
            });
            const reply: Message = { id: Date.now() + 1, role: 'model', text: result.text || "Error." };
            setAgentChats(prev => ({ ...prev, [agent.id]: [...(prev[agent.id] || []), reply] }));
        } catch (e) { console.error(e); }
    };

    const handleFeedback = (agentId: string, msgId: number, type: 'up'|'down', comment: string) => {
        setAgentChats(prev => ({ ...prev, [agentId]: prev[agentId].map(m => m.id === msgId ? { ...m, feedback: type, feedbackComment: comment } : m) }));
        console.log(`[Analytics] Feedback: ${type}, Comment: "${comment}"`);
    };

    const handleClassify = async (text: string, context: string[]) => {
        if(!process.env.API_KEY) return "No API Key configured.";
        try {
             const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
             const prompt = `Classify this text based on the following initiatives: ${context.join(', ')}. Return a concise analysis. Text: "${text}"`;
             const result = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: [{ role: 'user', parts: [{ text: prompt }] }]
            });
            return result.text || "Classification failed.";
        } catch (e) { return "Error calling AI service."; }
    };

    const handleInstallTool = (id: string) => {
        setExtensions(prev => prev.map(t => t.id === id ? { ...t, installed: !t.installed } : t));
    };

    if (!user) return <div className="h-screen bg-slate-900 flex items-center justify-center text-white font-mono animate-pulse">Initializing Lumina OS...</div>;

    return (
        <ErrorBoundary>
            <div className="flex h-screen bg-black text-white font-sans overflow-hidden">
                <div className="absolute inset-0 z-0">
                    <Canvas shadows camera={{ position: [0, 5, 10], fov: 50 }}>
                        <MetaScene systemHealth={80} agents={agents} onGetZoneSummary={getZoneSummary} />
                    </Canvas>
                </div>
                <div className="absolute top-0 left-0 right-0 z-10">
                    <Header user={user} integrations={integrations} agents={agents} />
                </div>
                <div className="absolute bottom-4 right-4 z-10 w-64 space-y-2 pointer-events-none">
                    {integrationEvents.slice(0, 3).map(ev => (
                        <div key={ev.id} className={`bg-slate-900/90 backdrop-blur border-l-4 p-3 rounded shadow-lg text-xs font-mono transition-all ${ev.handled ? 'border-green-500 opacity-50' : 'border-amber-500 opacity-100 animate-bounce'}`}>
                            <div className="flex justify-between items-center mb-1">
                                <span className="uppercase font-bold text-slate-400">{ev.type}</span>
                                {ev.handled && <span className="text-green-400">RESOLVED</span>}
                            </div>
                            <div className="text-white truncate">{ev.message}</div>
                        </div>
                    ))}
                </div>
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 md:p-8 pointer-events-none">
                    <div className="bg-white text-slate-900 w-full max-w-6xl h-[90vh] rounded-2xl shadow-2xl flex overflow-hidden pointer-events-auto border border-white/10">
                        <div className="w-20 md:w-64 bg-slate-50 border-r border-slate-200 p-4 flex flex-col shrink-0 items-center md:items-stretch">
                            <div className="text-xs font-bold uppercase text-slate-400 mb-4 hidden md:block">Modules</div>
                            <button onClick={() => setActiveTab('dashboard')} className={`p-3 rounded-lg mb-2 transition-colors ${activeTab === 'dashboard' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-200'}`}><Icons.Activity /></button>
                            <button onClick={() => setActiveTab('classifier')} className={`p-3 rounded-lg mb-2 transition-colors ${activeTab === 'classifier' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-200'}`}><Icons.Brain /></button>
                            <button onClick={() => setActiveTab('tools')} className={`p-3 rounded-lg mb-2 transition-colors ${activeTab === 'tools' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-200'}`}><Icons.Settings /></button>
                            <button onClick={() => setActiveTab('files')} className={`p-3 rounded-lg mb-2 transition-colors ${activeTab === 'files' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-200'}`}><Icons.Folder /></button>
                        </div>
                        <div className="flex-1 flex flex-col relative bg-slate-50 min-w-0 p-6 overflow-y-auto">
                            {activeTab === 'dashboard' && (
                                <>
                                    <div className="flex justify-between items-center mb-6">
                                        <h1 className="text-2xl font-bold text-slate-900">Ops Center</h1>
                                        <div className="flex gap-2">
                                            <button onClick={() => setIntegrations(p => p.includes('whatsapp') ? p.filter(x=>x!=='whatsapp') : [...p,'whatsapp'])} className={`px-3 py-1 rounded text-xs font-bold border ${integrations.includes('whatsapp') ? 'bg-green-50 border-green-200 text-green-700' : 'bg-white border-slate-200 text-slate-400'}`}>WhatsApp</button>
                                            <button onClick={() => setIntegrations(p => p.includes('telegram') ? p.filter(x=>x!=='telegram') : [...p,'telegram'])} className={`px-3 py-1 rounded text-xs font-bold border ${integrations.includes('telegram') ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-400'}`}>Telegram</button>
                                        </div>
                                    </div>
                                    <BoardAgents agents={agents} chats={agentChats} onChatStart={handleAgentChat} onFeedback={handleFeedback} />
                                    <div className="mt-6"><QuickActionsPanel onAction={() => {}} t={(k:any) => k} /></div>
                                </>
                            )}
                            {activeTab === 'classifier' && <AIClassifier initiatives={initiatives} onClassify={handleClassify} />}
                            {activeTab === 'tools' && <ToolRegistry tools={extensions} onInstall={handleInstallTool} />}
                            {activeTab === 'files' && <div className="text-center text-slate-500 mt-20">File Archive Module Loaded.</div>}
                        </div>
                    </div>
                </div>
            </div>
        </ErrorBoundary>
    );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);