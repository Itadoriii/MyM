import express from "express";
//Fix para __direname
import path from 'path';
import {fileURLToPath} from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { methods as metodos } from "./controllers/authentication.controller.js";
import { methods as authorization} from "./middlewares/authorization.js";

import cookieParser from 'cookie-parser';

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
        tipo: "madera",
        descripcion: "1x4x3,20MTS",
        Linkimg: "https://www.maderasmym.cl/carro/image/thumbnails/18/6a/1x4jpg-100013-500x500.jpg"
    },
    {
        id:2,
        name: "Pino2",
        precio: 25990,
        imagen: "",
        stock: 30,
        tipo: "madera",
        descripcion: "",
        Linkimg:"https://www.maderasmym.cl/carro/image/thumbnails/18/6a/1x4jpg-100013-500x500.jpg"
    },
    {
        id:3,
        name: "pino3",
        precio: 25777,
        imagen: "",
        stock: 30,
        tipo: "madera",
        Linkimg:"https://www.maderasmym.cl/carro/image/thumbnails/18/6a/1x4jpg-100013-500x500.jpg"

    }
] 

// CONFIGURACION
app.use(express.json());
app.use(express.static(path.join(__dirname, 'src')));
app.use(cookieParser());

// RUTAS 
app.get('/',authorization.soloPublico, (req, res) => {
  res.send('Hello World!')
})
app.get('/login', (req, res) => {
  res.sendFile(__dirname  + "/src/login.html")
})
app.get('/register',authorization.soloPublico, (req, res) => {
  res.sendFile(__dirname  + "/src/register.html")
})
app.post('/api/register',metodos.register)
app.post('/api/login',metodos.login)
app.get("/admin",authorization.soloAdmin,(req,res)=> res.sendFile(__dirname + "/src/admin.html"));

app.get('/admin', (req, res) => {
  res.sendFile(__dirname  + "/src/admin.html")
})
app.get('/productos', (req, res) => {
    res.send(productos)
  });


