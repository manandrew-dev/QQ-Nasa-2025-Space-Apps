import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import SearchPage from "./components/SearchPage";

// src/App.js
import './styles/Index.css'
import SearchReturnPage from './components/SearchReturnPage';

function App() {
  return (
    <div>
        <SearchReturnPage></SearchReturnPage>
    </div>
  );
}

export default App;
