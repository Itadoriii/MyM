<?php
// ===== CONFIG DB =====
$dsn = "mysql:host=207.210.102.100;port=3306;dbname=sebasti9_mym2;charset=utf8mb4";
$userDb = "sebasti9_sebasti9";
$passDb = "oa4P6]Y9!5FkYw";

// ===== CONFIG EMAIL =====
$GMAIL_USER = "maderas.mym@gmail.com";
$GMAIL_PASS = "yepa bmki hwaz anbu";

// ===== CONFIG JWT =====
$JWT_SECRET = "textosecretoDECIFRADO"; // pon el mismo que en Node

// ===== LIBRERÍA JWT SIMPLE =====
function jwtDecode($jwt, $key) {
    $parts = explode('.', $jwt);
    if (count($parts) != 3) return false;
    $payload = json_decode(base64_decode(strtr($parts[1], '-_', '+/')), true);
    $sig = base64_decode(strtr($parts[2], '-_', '+/'));
    $validSig = hash_hmac('sha256', "$parts[0].$parts[1]", $key, true);
    return hash_equals($sig, $validSig) ? $payload : false;
}

// ===== CONECTAR DB =====
try {
    $pdo = new PDO($dsn, $userDb, $passDb, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "error" => "Error DB"]);
    exit;
}

// ===== LEER COOKIE JWT =====
$jwt = $_COOKIE['jwt'] ?? '';
if (!$jwt) {
    http_response_code(401);
    echo json_encode(["success" => false, "error" => "No autenticado"]);
    exit;
}

$userData = jwtDecode($jwt, $JWT_SECRET);
if (!$userData) {
    http_response_code(401);
    echo json_encode(["success" => false, "error" => "JWT inválido"]);
    exit;
}

// ===== LEER BODY =====
$input = json_decode(file_get_contents("php://input"), true);
$cart = $input['cart'] ?? [];
$delivery = $input['delivery'] ?? null;
$comentarios = $input['comentarios'] ?? "";

// ===== GUARDAR PEDIDO EN DB =====
try {
    $stmt = $pdo->prepare("INSERT INTO pedidos (usuario, datos_carrito, delivery, comentarios, fecha) VALUES (?, ?, ?, ?, NOW())");
    $stmt->execute([
        $userData['user'],
        json_encode($cart),
        json_encode($delivery),
        $comentarios
    ]);
    $pedidoId = $pdo->lastInsertId();
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "error" => "Error guardando pedido"]);
    exit;
}

// ===== GENERAR HTML DEL CORREO =====
$html = "<h2 style='color:#2c3e50;'>Nuevo Pedido #$pedidoId</h2>";
$html .= "<p><strong>Cliente:</strong> {$userData['user']}</p>";
$html .= "<p><strong>Comentarios:</strong> $comentarios</p>";

$html .= "<table border='1' cellpadding='8' cellspacing='0' style='border-collapse: collapse; width: 100%;'>
<tr style='background-color: #f8f9fa;'>
<th>Producto</th>
<th>Cantidad</th>
<th>Precio Unitario</th>
<th>Total</th>
</tr>";

$totalFinal = 0;
foreach ($cart as $item) {
    $nombre = htmlspecialchars($item['name']);
    $cantidad = intval($item['quantity']);
    $precio = number_format(floatval($item['price']), 0, ',', '.');
    $total = number_format($cantidad * floatval($item['price']), 0, ',', '.');
    $totalFinal += $cantidad * floatval($item['price']);
    
    $html .= "<tr>
        <td>$nombre</td>
        <td style='text-align:center;'>$cantidad</td>
        <td style='text-align:right;'>\$$precio</td>
        <td style='text-align:right;'>\$$total</td>
    </tr>";
}

$html .= "<tr style='background-color:#e9ecef; font-weight:bold;'>
<td colspan='3' style='text-align:right;'>TOTAL</td>
<td style='text-align:right;'>\$".number_format($totalFinal, 0, ',', '.')."</td>
</tr>";
$html .= "</table>";

// ===== ENVIAR CORREO =====
require_once __DIR__ . '/PHPMailer.php';
require_once __DIR__ . '/SMTP.php';
require_once __DIR__ . '/Exception.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

$mail = new PHPMailer(true);
try {
    $mail->isSMTP();
    $mail->Host = 'smtp.gmail.com';
    $mail->SMTPAuth = true;
    $mail->Username = $GMAIL_USER;
    $mail->Password = $GMAIL_PASS;
    $mail->SMTPSecure = 'tls';
    $mail->Port = 587;

    $mail->setFrom($GMAIL_USER, 'Maderas MyM');
    $mail->addAddress($GMAIL_USER, 'Maderas MyM');
    $mail->isHTML(true);
    $mail->Subject = "Nuevo pedido #$pedidoId";
    $mail->Body = $html;

    $mail->send();
} catch (Exception $e) {
    // Si falla el correo, no cortamos el flujo
}

echo json_encode(["success" => true, "pedidoId" => $pedidoId]);
