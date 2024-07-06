import bcrypt from 'bcrypt';
import jsonwebtoken from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

export const usuarios = [{
    user: "a",
    email: "admin@admin.cl",
    password: "$2b$05$6y5hh4Eg.pES9vCaSr/RIuMvxWOFbN96Qki84Nkfy/qHv9ElCfwIK", // "a"
    role: "admin"  },
    {
      user: 'b',
      email: 'b@b.cl',
      password: '$2b$05$b4/ET8phIZjzJMbv3ha9euPUB3bbUTScY9BfkyhxZOKfrdwxy1KW6',
      role: 'user'
    }
  
  ];// Agregamos un rol para el usuario 

async function login(req, res) {
    console.log(req.body);
    const user = req.body.user;
    const password = req.body.password;
    if (!user || !password) {
        return res.status(400).send({ status: "Error", message: "Los campos están incompletos" });
    }
    const usuarioAResvisar = usuarios.find(usuario => usuario.user === user);
    if (!usuarioAResvisar) {
        return res.status(400).send({ status: "Error", message: "Error durante login" });
    }
    const loginCorrecto = await bcrypt.compare(password, usuarioAResvisar.password);
    if (!loginCorrecto) {
        return res.status(400).send({ status: "Error", message: "Error durante login" });
    }
    const token = jsonwebtoken.sign(
        { user: usuarioAResvisar.user, role: usuarioAResvisar.role }, // Incluimos el rol en el token
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRATION }
    );

    const cookieOption = {
        expires: new Date(Date.now() + process.env.JWT_COOKIE_EXPIRES * 24 * 60 * 60 * 1000),
        path: "/"
    };
    res.cookie("jwt", token, cookieOption);
    res.send({ status: "ok", message: "Usuario loggeado", redirect: "/admin" });
}

async function register(req, res) {
    console.log(req.body);
    const user = req.body.user;
    const password = req.body.password;
    const email = req.body.email;
    if (!user || !password || !email) {
        return res.status(400).send({ status: "Error", message: "Los campos están vacíos" });
    }
    const usuariorevision = usuarios.find(usuario => usuario.user === user);
    if (usuariorevision) {
        return res.status(400).send({ status: "Error", message: "Este usuario ya existe" });
    }
    const salt = await bcrypt.genSalt(5);
    const hashPassword = await bcrypt.hash(password, salt);
    const nuevoUsuario = {
        user,
        email,
        password: hashPassword,
        role: "user" // Asignamos rol de usuario por defecto
    };
    usuarios.push(nuevoUsuario);
    console.log(usuarios);
    return res.status(201).send({ status: "ok", message: `Usuario ${nuevoUsuario.user} agregado`, redirect: "/" });
}

function logout(req, res) {
    res.cookie("jwt", "", { expires: new Date(0), path: "/" });
    res.send({ status: "ok", message: "Usuario deslogeado", redirect: "/login" });
}

export const methods = {
    login,
    register,
    logout // Exportamos la nueva función
};
