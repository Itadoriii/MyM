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
// ===== LIBRERÍAS PHPMailer =====
require_once __DIR__ . '/PHPMailer.php';
require_once __DIR__ . '/SMTP.php';
require_once __DIR__ . '/Exception.php';
use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

// ===== LEER BODY =====
$input = json_decode(file_get_contents("php://input"), true);
$cart = $input['cart'] ?? [];
$delivery = $input['delivery'] ?? null;
$comentarios = $input['comentarios'] ?? "";

// ===== VALIDACIONES =====
if (empty($cart)) {
    http_response_code(400);
    echo json_encode(["success" => false, "error" => "Carrito vacío"]);
    exit;
}

// ===== REINTENTOS POR DEADLOCK =====
$MAX_RETRY = 3;
for ($attempt=1; $attempt <= $MAX_RETRY; $attempt++) {
    try {
        $pdo->beginTransaction();

        // ===== OBTENER ID USUARIO =====
        $stmt = $pdo->prepare("SELECT id_usuarios, email, number FROM usuarios WHERE user=?");
        $stmt->execute([$userData['user']]);
        $u = $stmt->fetch();
        if (!$u) throw new Exception("Usuario no encontrado");

        // ===== BLOQUEAR PRODUCTOS =====
        $ids = array_unique(array_map(fn($i) => intval($i['id_producto']), $cart));
        sort($ids);
        $in = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $pdo->prepare("SELECT id_producto, disponibilidad FROM productos WHERE id_producto IN ($in) FOR UPDATE");
        $stmt->execute($ids);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $stockMap = [];
        foreach ($rows as $r) $stockMap[intval($r['id_producto'])] = intval($r['disponibilidad']);

        // ===== VERIFICAR STOCK =====
        foreach ($cart as $item) {
            $need = intval($item['quantity'] ?? 0);
            $have = $stockMap[intval($item['id_producto'])] ?? 0;
            if ($have < $need) throw new Exception("Stock insuficiente para producto {$item['id_producto']}");
        }

        // ===== INSERTAR PEDIDO =====
        $precioTotal = 0;
        foreach ($cart as $i) $precioTotal += (floatval($i['price']) ?? 0) * intval($i['quantity'] ?? 0);

        $stmt = $pdo->prepare("INSERT INTO pedidos (id_usuario, precio_total, fecha_pedido, estado) VALUES (?, ?, NOW(), ?)");
        $stmt->execute([$u['id_usuarios'], $precioTotal, 'pendiente']);
        $pedidoId = $pdo->lastInsertId();

        // ===== INSERTAR DETALLES Y RESTAR STOCK =====
        foreach ($ids as $pid) {
            foreach (array_filter($cart, fn($i)=>intval($i['id_producto'])==$pid) as $it) {
                $stmt = $pdo->prepare("INSERT INTO detalle_pedido (id_pedido, id_producto, cantidad, precio_detalle) VALUES (?, ?, ?, ?)");
                $stmt->execute([$pedidoId, $pid, intval($it['quantity']), floatval($it['price'])]);

                $stmt = $pdo->prepare("UPDATE productos SET disponibilidad = disponibilidad - ? WHERE id_producto = ?");
                $stmt->execute([intval($it['quantity']), $pid]);
            }
        }

        $pdo->commit();

        // ===== GENERAR HTML CORREO =====
        $html = "<h2 style='color:#2c3e50;'>Pedido #$pedidoId</h2>";
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
            $precio = floatval($item['price']);
            $total = $cantidad * $precio;
            $totalFinal += $total;
            $html .= "<tr>
            <td>$nombre</td>
            <td style='text-align:center;'>$cantidad</td>
            <td style='text-align:right;'>\$".number_format($precio,0,',','.')."</td>
            <td style='text-align:right;'>\$".number_format($total,0,',','.')."</td>
            </tr>";
                    }

                    $html .= "<tr style='background-color:#e9ecef; font-weight:bold;'>
            <td colspan='3' style='text-align:right;'>TOTAL</td>
            <td style='text-align:right;'>\$".number_format($totalFinal,0,',','.')."</td>
            </tr>";
                    $html .= "</table>";

        // ===== ENVIAR CORREO =====
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
            error_log("Mail Error: ".$e->getMessage());
        }

        echo json_encode(["success" => true, "pedidoId" => $pedidoId]);
        exit;

    } catch (Exception $e) {
        $pdo->rollBack();
        if ($attempt < $MAX_RETRY && str_contains($e->getMessage(), 'deadlock')) {
            usleep(200000 + rand(0,400000));
            continue;
        }
        http_response_code(500);
        echo json_encode(["success" => false, "error" => $e->getMessage()]);
        exit;
    }
}
