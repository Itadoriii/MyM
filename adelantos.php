<?php
header('Content-Type: application/json');
header("Access-Control-Allow-Origin: *"); 
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

$method = $_SERVER['REQUEST_METHOD'];
$input = json_decode(file_get_contents('php://input'), true);
$id = isset($_GET['id']) ? intval($_GET['id']) : null;

switch ($method) {
    case 'GET':
        if ($id) {
            $stmt = $conn->prepare("SELECT a.*, t.nombres, t.apellidos, t.rut, t.sueldo 
                                    FROM adelantos a 
                                    JOIN trabajadores t ON a.id_trabajador = t.id_trabajador
                                    WHERE a.id_adelanto=?");
            $stmt->bind_param("i", $id);
            $stmt->execute();
            $result = $stmt->get_result()->fetch_assoc();
            echo json_encode($result);
        } else {
            // filtros opcionales
            $trabajador = isset($_GET['trabajador']) ? intval($_GET['trabajador']) : null;
            $mes = isset($_GET['mes']) ? intval($_GET['mes']) : null;
            $año = isset($_GET['año']) ? intval($_GET['año']) : null;
            $page = isset($_GET['page']) ? max(1,intval($_GET['page'])) : 1;
            $limit = isset($_GET['limit']) ? intval($_GET['limit']) : 50;
            $offset = ($page - 1) * $limit;

            $query = "SELECT a.*, t.nombres, t.apellidos, t.rut, t.sueldo FROM adelantos a JOIN trabajadores t ON a.id_trabajador = t.id_trabajador WHERE 1=1";
            $params = [];
            $types = "";

            if ($trabajador) { $query .= " AND a.id_trabajador=?"; $params[]=$trabajador; $types.="i"; }
            if ($mes && $año) { $query .= " AND MONTH(a.fecha)=? AND YEAR(a.fecha)=?"; $params[]=$mes; $params[]=$año; $types.="ii"; }
            elseif ($año) { $query .= " AND YEAR(a.fecha)=?"; $params[]=$año; $types.="i"; }

            $queryTotal = $query;
            $stmtTotal = $conn->prepare($queryTotal);
            if($types) $stmtTotal->bind_param($types, ...$params);
            $stmtTotal->execute();
            $total = $stmtTotal->get_result()->num_rows;

            $query .= " ORDER BY a.fecha DESC, a.id_adelanto DESC LIMIT ? OFFSET ?";
            $params[] = $limit; $params[] = $offset; $types .= "ii";

            $stmt = $conn->prepare($query);
            if($types) $stmt->bind_param($types, ...$params);
            $stmt->execute();
            $result = $stmt->get_result();
            $adelantos = [];
            while($row = $result->fetch_assoc()) { $adelantos[]=$row; }

            echo json_encode(['total'=>$total,'adelantos'=>$adelantos]);
        }
        break;

    case 'POST':
        $id_trabajador = $input['id_trabajador'] ?? null;
        $bono = $input['bono'] ?? null;
        $motivos = $input['motivos'] ?? '';
        $monto = $input['monto'] ?? null;
        $fecha = $input['fecha'] ?? null;

        if (!$id_trabajador || $monto===null || !$fecha) { 
            http_response_code(400); 
            echo json_encode(['error'=>'ID trabajador, monto y fecha son obligatorios']); 
            exit; 
        }

        // Verificar trabajador
        $stmt = $conn->prepare('SELECT * FROM trabajadores WHERE id_trabajador=?');
        $stmt->bind_param("i",$id_trabajador);
        $stmt->execute();
        if(!$stmt->get_result()->fetch_assoc()){ http_response_code(400); echo json_encode(['error'=>'Trabajador no encontrado']); exit; }

        $stmt = $conn->prepare("INSERT INTO adelantos (id_trabajador, bono, motivos, monto, fecha) VALUES (?,?,?,?,?)");
        $stmt->bind_param("issds",$id_trabajador,$bono,$motivos,$monto,$fecha);
        if($stmt->execute()){
            $newId = $stmt->insert_id;
            $stmt = $conn->prepare("SELECT a.*, t.nombres, t.apellidos FROM adelantos a JOIN trabajadores t ON a.id_trabajador = t.id_trabajador WHERE a.id_adelanto=?");
            $stmt->bind_param("i",$newId);
            $stmt->execute();
            echo json_encode($stmt->get_result()->fetch_assoc());
        } else {
            http_response_code(500);
            echo json_encode(['error'=>$stmt->error]);
        }
        break;

    case 'PUT':
        if(!$id){ http_response_code(400); echo json_encode(['error'=>'ID requerido']); exit; }
        $id_trabajador = $input['id_trabajador'] ?? null;
        $bono = $input['bono'] ?? null;
        $motivos = $input['motivos'] ?? '';
        $monto = $input['monto'] ?? null;
        $fecha = $input['fecha'] ?? null;
        if (!$id_trabajador || $monto===null || !$fecha) { http_response_code(400); echo json_encode(['error'=>'ID trabajador, monto y fecha son obligatorios']); exit; }

        // Verificar adelanto
        $stmt = $conn->prepare('SELECT * FROM adelantos WHERE id_adelanto=?');
        $stmt->bind_param("i",$id); $stmt->execute();
        if(!$stmt->get_result()->fetch_assoc()){ http_response_code(404); echo json_encode(['error'=>'Adelanto no encontrado']); exit; }

        // Verificar trabajador
        $stmt = $conn->prepare('SELECT * FROM trabajadores WHERE id_trabajador=?');
        $stmt->bind_param("i",$id_trabajador); $stmt->execute();
        if(!$stmt->get_result()->fetch_assoc()){ http_response_code(400); echo json_encode(['error'=>'Trabajador no encontrado']); exit; }

        $stmt = $conn->prepare("UPDATE adelantos SET id_trabajador=?, bono=?, motivos=?, monto=?, fecha=? WHERE id_adelanto=?");
        $stmt->bind_param("issdsi",$id_trabajador,$bono,$motivos,$monto,$fecha,$id);
        if($stmt->execute()){
            $stmt = $conn->prepare("SELECT a.*, t.nombres, t.apellidos FROM adelantos a JOIN trabajadores t ON a.id_trabajador = t.id_trabajador WHERE a.id_adelanto=?");
            $stmt->bind_param("i",$id); $stmt->execute();
            echo json_encode($stmt->get_result()->fetch_assoc());
        } else { http_response_code(500); echo json_encode(['error'=>$stmt->error]); }
        break;

    case 'DELETE':
        if(!$id){ http_response_code(400); echo json_encode(['error'=>'ID requerido']); exit; }
        $stmt = $conn->prepare("DELETE FROM adelantos WHERE id_adelanto=?");
        $stmt->bind_param("i",$id);
        if($stmt->execute()){ echo json_encode(['message'=>'Adelanto eliminado']); } 
        else { http_response_code(500); echo json_encode(['error'=>$stmt->error]); }
        break;

    case 'OPTIONS':
        http_response_code(200); break;

    default:
        http_response_code(405); echo json_encode(['error'=>'Método no permitido']); break;
}

$conn->close();
?>
