<?php
header('Content-Type: application/json');
header("Access-Control-Allow-Origin: *"); // permite peticiones desde cualquier frontend
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

$host = '207.210.102.100';
$user = 'sebasti9_sebasti9';
$pass = 'oa4P6]Y9!5FkYw';
$db   = 'sebasti9_mym2';

$conn = new mysqli($host, $user, $pass, $db);
if ($conn->connect_error) {
    http_response_code(500);
    echo json_encode(['error' => $conn->connect_error]);
    exit;
}

// Para PUT y DELETE leemos el body
$method = $_SERVER['REQUEST_METHOD'];
$input = json_decode(file_get_contents('php://input'), true);

$id = isset($_GET['id']) ? intval($_GET['id']) : null;

switch ($method) {
    case 'GET':
        if ($id) {
            $stmt = $conn->prepare("SELECT * FROM trabajadores WHERE id_trabajador = ?");
            $stmt->bind_param("i", $id);
            $stmt->execute();
            $result = $stmt->get_result()->fetch_assoc();
            echo json_encode($result);
        } else {
            $result = $conn->query("SELECT * FROM trabajadores ORDER BY id_trabajador DESC");
            $trabajadores = [];
            while ($row = $result->fetch_assoc()) {
                $trabajadores[] = $row;
            }
            echo json_encode(['total'=>count($trabajadores),'trabajadores'=>$trabajadores]);
        }
        break;

    case 'POST':
        $stmt = $conn->prepare("INSERT INTO trabajadores (rut, nombres, apellidos, fechaIngreso, sueldo, fono, estado) VALUES (?, ?, ?, ?, ?, ?, ?)");
        $stmt->bind_param(
            "ssssdis",
            $input['rut'],
            $input['nombres'],
            $input['apellidos'],
            $input['fechaIngreso'],
            $input['sueldo'],
            $input['fono'],
            $input['estado']
        );
        if ($stmt->execute()) {
            echo json_encode(['message' => 'Trabajador agregado', 'id_trabajador' => $stmt->insert_id]);
        } else {
            http_response_code(500);
            echo json_encode(['error' => $stmt->error]);
        }
        break;

    case 'PUT':
        if (!$id) { http_response_code(400); echo json_encode(['error'=>'ID requerido']); exit; }
        $stmt = $conn->prepare("UPDATE trabajadores SET rut=?, nombres=?, apellidos=?, fechaIngreso=?, sueldo=?, fono=?, estado=? WHERE id_trabajador=?");
        $stmt->bind_param(
            "ssssdisi",
            $input['rut'],
            $input['nombres'],
            $input['apellidos'],
            $input['fechaIngreso'],
            $input['sueldo'],
            $input['fono'],
            $input['estado'],
            $id
        );
        if ($stmt->execute()) {
            echo json_encode(['message'=>'Trabajador actualizado']);
        } else {
            http_response_code(500);
            echo json_encode(['error'=>$stmt->error]);
        }
        break;

    case 'DELETE':
        if (!$id) { http_response_code(400); echo json_encode(['error'=>'ID requerido']); exit; }
        $stmt = $conn->prepare("DELETE FROM trabajadores WHERE id_trabajador=?");
        $stmt->bind_param("i", $id);
        if ($stmt->execute()) {
            echo json_encode(['message'=>'Trabajador eliminado']);
        } else {
            http_response_code(500);
            echo json_encode(['error'=>$stmt->error]);
        }
        break;

    case 'OPTIONS':
        // Para CORS preflight
        http_response_code(200);
        break;

    default:
        http_response_code(405);
        echo json_encode(['error'=>'Método no permitido']);
        break;
}

$conn->close();
?>
