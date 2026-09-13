import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Header from './components/Header/Header';
import Nav from './components/Nav/Nav';
import Home from './Pages/Home/Home';
import ChaosMode from './Pages/Chaos/Chaos';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <div className="app-container">
        {/* Top Header */}
        <Header />
        
        {/* Bottom Section: Sidebar + Main Content */}
        <div className="app-body">
          <Nav />
          <main className="app-main">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/kubernetes" element={<h2>Kubernetes Page Coming Soon</h2>} />
              <Route path="/chaos" element={<ChaosMode />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}

export default App;