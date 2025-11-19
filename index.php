<?php 

$json = file_get_contents('include/configuration.json'); 

if ($json === false) {
    die('Error reading the JSON file');
}

$json_data = json_decode($json, true); 

if ($json_data === null) {
    die('Error decoding the JSON file');
}

if($_POST['json']!=""){
	file_put_contents("include/configuration.json", $_POST['json']);
	echo "<script>.toast('show'); </script>";
	header("Location: index.php?Saved=true&access=true");
	die();
}

if($_POST['backup']=="1"){
	$jsonData = json_encode($json, JSON_PRETTY_PRINT);
	$filename = "Status Page - Config Backup.json";
	sleep(2);
	header('Content-Type: application/json');
	header('Content-Disposition: attachment; filename="' . $filename . '"');
	header('Content-Length: ' . strlen($jsonContent));
	echo "<script>window.location.href = window.location.href;</script>";
	die();
}
?>
<html>
  <head>
    <title><?php echo $json_data['business_name']; ?> Status Page</title>
	<link rel="icon" type="image/x-icon" href="images/<?php echo $json_data['business_logo']; ?>">
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="index.css" />	
	<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.6.0/css/all.min.css" integrity="sha512-Kc323vGBEqzTmouAECnVceyQqyqdsSiqLQISBL29aUW4U/M7pSPA/gEUZQqv1cwx4OnYxTxve5UMg5GT6L4JJg==" crossorigin="anonymous" referrerpolicy="no-referrer" />
	<script src="https://ajax.googleapis.com/ajax/libs/jquery/2.1.3/jquery.min.js"></script>
	<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" integrity="sha384-QWTKZyjpPEjISv5WaRU9OFeRpok6YctnYmDr5pNlyT2bRjXh0JMhjY6hW+ALEwIH" crossorigin="anonymous">
	<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js" integrity="sha384-YvpcrYf0tY3lHB60NNkmXc5s9fDVZLESaAA55NDzOxhy9GkcIdslK1eN7N6jIeHz" crossorigin="anonymous"></script>
	<script src="https://cdnjs.cloudflare.com/ajax/libs/jquery.webticker/3.0.0/jquery.webticker.min.js" integrity="sha512-sGvMKcHwoC9BkOtA57heMk9Gz/076xz4oLJmhLFKav+FHkVhNCmXlUtPnnBJGvVK3nn/gZ6Y52Tn8UmgtKtaUQ==" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
  </head>
  <style>
  body::-webkit-scrollbar {
	  display: none;
  }
  </style>
  <body>
	<div id="main_content">
		<center>
			<div class="spinner-border text-primary" style="margin-top:200px" role="status">
			  <span class="sr-only">Loading...</span>
			</div>
			<h6 style="margin-top:20px;margin-bottom:400px">Refreshing Data...</h6>
		</center>
	</div>
	
    <footer>
		<hr>
		<center><?php echo $json_data['footer_message']; ?></center>
    </footer>
	<!--------------------------------------Start Modal------------------------------------------------>
	<div class="modal fade" id="addModal" tabindex="-1" role="dialog" aria-labelledby="exampleModalLabel" aria-hidden="true">
	  <div class="modal-dialog  modal-lg" role="document">
		<div class="modal-content">
		  <form method="post">
			  <div class="modal-header">
				<h5 class="modal-title" style="display:inline" id="exampleModalLabel">Modify Configuration</h5>
				<input name="backup" type="hidden" value="1">
				<button type="submit" style="position:absolute;float:right;right:0;margin-right:10px" class=" btn-sm btn btn-warning">Backup Configuration</button> 
			  </div>
		  </form>
		  <form method="post">
			<div class="modal-body">		  
			  <div class="form-group">
				<label for="message-text" class="col-form-label">JSON:</label>
				<textarea spellcheck="false" class="form-control" name="json" rows="20" ><?php print_r($json); ?></textarea>
			  </div>		
			</div>
			  <div class="modal-footer">
				
				<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
				<button type="submit" class="btn btn-primary">Save Changes</button>
			  </div>
		  </form>
		</div>
	  </div>
	</div>
	<!--------------------------------------End Modal------------------------------------------------>
	<?php 
		if($_get['BackedUp']=="true"){
			
		}
		if($_get['Saved']=="true"){
			
		}	
	?>
  </body>
  <script>
	
	function timingLoad() {
		$('#main_content').load('include/backend.php?access=true', function() {
			/// can add another function here
		});
	}
	timingLoad();
	$(document).ready(function() { 	
		setInterval(timingLoad, <?php echo $json_data['refresh_rate']; ?>);		
	}); 
  </script>
 <!----- Created by Brandon Sanders ----->
</html>
