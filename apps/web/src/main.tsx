import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { MidiProvider } from "./components/midi/MidiContext";
import { AuthProvider } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider><BrowserRouter><AuthProvider><MidiProvider><App /></MidiProvider></AuthProvider></BrowserRouter></ThemeProvider>
  </React.StrictMode>,
);
