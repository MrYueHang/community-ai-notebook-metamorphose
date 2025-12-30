import React, { Component, useState, useRef, useEffect, useMemo, type ReactNode, type ErrorInfo } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI } from "@google/genai";
import { Canvas, useFrame } from '@react-three/fiber';
import { Text, Html, Billboard, RoundedBox, SoftShadows, Environment, Float as DreiFloat, Line, Sparkles, Stars, Sphere, Cylinder } from '@react-three/drei';
import * as THREE from 'three';

// --- CONFIG & TYPES ---
const APP_CONFIG = {
    version: 'Gezypolis v2.2-AgentSwarm',
    env: 'production',
};

// --- ICONS ---
const Icons = {
    Zap: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
    Brain: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2