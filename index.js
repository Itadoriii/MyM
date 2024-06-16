import express from "express";
//Fix para __direname
import path from 'path';
import {fileURLToPath} from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { methods as metodos } from "./controllers/authentication.controller.js";

// SERVIDOR 
const app = express()
const port = 3000
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
  

const productos = [
    {
        id:1,
        name: "Pino1",
        precio: 50,
        imagen: "",
        stock: 30,
        tipo: "madera"
    },
    {
        id:2,
        name: "Pino2",
        precio: 25990,
        imagen: "",
        stock: 30,
        tipo: "madera"
    },
    {
        id:3,
        name: "pino3",
        precio: 25777,
        imagen: "",
        stock: 30,
        tipo: "madera"
    }
] 

// CONFIGURACION
app.use(express.json());
// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'src')));
// RUTAS 
app.get('/', (req, res) => {
  res.send('Hello World!')
})
app.get('/login', (req, res) => {
  res.sendFile(__dirname  + "/src/login.html")
})
app.get('/register', (req, res) => {
  res.sendFile(__dirname  + "/src/register.html")
})
app.post('/api/register',metodos.register)


app.get('/admin', (req, res) => {
  res.sendFile(__dirname  + "/src/admin.html")
})
app.get('/productos', (req, res) => {
    res.send(productos)
  });


