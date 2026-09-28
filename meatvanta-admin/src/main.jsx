import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { installAudioUnlock } from "./lib/notificationSound";
import "./index.css";

// Installed before anything renders, so the click that submits the login form
// is what unlocks audio - by the time the admin reaches the dashboard, the
// notification chime is already primed.
installAudioUnlock();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
