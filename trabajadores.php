<?php
header('Content-Type: application/json');
$conn = new mysqli('207.210.102.100','sebasti9_sebasti9','oa4P6]Y9!5FkYw','sebasti9_mym2');
$result = $conn->query("SELECT * FROM trabajadores ORDER BY id_trabajador DESC");
$trabajadores = [];
while($row = $result->fetch_assoc()) $trabajadores[] = $row;
echo json_encode(['total'=>count($trabajadores),'trabajadores'=>$trabajadores]);
