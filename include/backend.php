<?php
//Created by Brandon Sanders


date_default_timezone_set('America/Chicago');
require 'simple_html_dom.php';

$json = file_get_contents('configuration.json'); 

if ($json === false) {
	die('Error reading the JSON file');
}

$json_data = json_decode($json, true); 
		
if($_GET['access']!="true") exit("Not authorized");

function check_port($host, $port) {
  $connection = @fsockopen($host.".".$json_data['domain'], $port);
  if (is_resource($connection)) {
    fclose($connection);
    return true;
  } else {
    return false;
  }
}

foreach ($json_data['providers'][0] as $key => $value) {
	$realIP = file_get_contents("http://ipecho.net/plain");
	if($realIP==$value){
		$ISP = $key;
	}
}

$errors = 0;

//wide
exec("ping -n 1 " . $json_data['public_dns'], $output, $result);
if ($result == 0){
	$wide_text = "Operational";
	$wide_color = "green";
}else{
	$wide_text = "Failure";	
	$wide_color = "red";
	$errors++;
}

//local
exec("ping -n 1 " . $json_data['gateway'], $output, $result);
if ($result == 0){
	$local_text = "Operational";
	$local_color = "green";
}else{
	$local_text = "Failure";	
	$local_color = "red";
	$errors++;
}

function getRSS($url,$tag) {    
        $rss = simplexml_load_file($url);
        $count = 0;
		if($tag=="item"){
			$x = $rss->channel->item;	
		}else{
			$x = $rss->entry;
		}
        foreach($x as $item) {
            $count++;
            if($count > 1){
                break;
            }
			$html .= htmlspecialchars($item->title);
        }
		
    return $html;
}
?>

	<div class="pageContainer" style="padding:40px;">	  
	  <button title="Edit Configuration" type="button" style="float:right;margin-top:10px;margin-right:20px" data-bs-toggle="modal" data-bs-target="#addModal" class="btn btn-dark"><i class="fa-solid fa-gear"></i></button>
	  <span style="float:right;margin-top:13px;margin-right:20px;color:#696969"><small>Last updated: <?php echo date("F j, Y, g:i a"); ?></small></span>
      <div class="headline">
        <img src="<?php echo $json_data['business_logo']; ?>" alt="Logo" width="250px" />
		<span style="font-size:18px"> System Status </span>
      </div>
	  <?php
		if ($json_data === null) {
			die('Error decoding the JSON file');
		}
	  ?>
	<br>
	  <div id="all_status" style="font-size:26px" class="alert alert-success text-center" role="alert">
		  <ul id="webTicker">   
			 <li><b>All Systems Operational</b></li>
		  </ul>	
	  </div><br>
      <div id="list">   
		<div class="container">
		 <div class="alert alert-default" style="border: 1px solid grey" role="alert">
			<h6>Local-Area Network<span style="color:<?php echo $local_color; ?>;float:right"><?php echo $local_text; ?></span></h6>
			<hr>
			<h6>Wide-Area Network<span style="color:<?php echo $wide_color; ?>;float:right"><?php echo $wide_text." (".$ISP.")"; ?></span></h6>
		  </div><br>
		<h5>Internally Hosted Services</h5><hr>
		 <div class="row">
			<?php 
				foreach ($json_data['internal_hosts'] as $value) {
					if($value['port']!=""){
						if (check_port($value['host'], $value['port'])) {
							$status = '<i style="font-size:30px;color:green" class="fa-solid fa-square-check"></i>';
							$bg="";							
						}else{
							$status = '<i style="font-size:30px;color:red" class="fa-solid fa-square-xmark"></i>';
							$bg = "background:#fddddd;color:maroon";
							if($json_data['alert_sound']=="true"){
								//play sound
							?>
								<audio autoplay>
									<source src="audio/alert.wav" type="audio/wav">
									Your browser does not support the audio element.
								</audio>							
							<?php
							}
							$errors++;
						}					
					}elseif($value['port']==""){
						exec("ping -n 2 " . $value['host'], $output, $result);
						if ($result == 0){
							$status = '<i style="font-size:30px;color:green" class="fa-solid fa-square-check"></i>';		
							$bg="";
						}else{
							$status = '<i style="font-size:30px;color:red" class="fa-solid fa-square-xmark"></i>';
							$bg = "background:#fddddd;color:maroon;border-radius:10px;";
							if($json_data['alert_sound']=="true"){
								//play sound
							?>
								<audio autoplay>
									<source src="audio/alert.wav" type="audio/wav">
									Your browser does not support the audio element.
								</audio>							
							<?php
							}
							$errors++;
						}
					}else{
						//$status = '<i style="font-size:30px;color:red" class="fa-solid fa-square-xmark"></i>';
						//$errors++;
					}
					if($value['name']!=""){
						$title = $value['name'];
					}else{
						$title = $value['host'] ;
					}
			?>
				<div style="margin-bottom:10px;" class="col-md-3 col-lg-3 col-sm-6 col-xl-3">
				  <div id="statusContainerTemplate" style="<?php echo $bg; ?>;padding:10px" class="statusContainer">
					  <div class="statusHeader">
					    <div style="display:inline"><?php echo $status; ?></div> &nbsp;&nbsp;
						<h5 style="display:inline" class="statusTitle"><?php echo ucwords($title); ?>&nbsp;</h5>						
					  </div>
					  <div class="statusSubtitle">
						<div class="sectionUrl"><span><?php echo $value['type']; ?> Service</span></div>
						<div class="statusUptime"></div>
					  </div>
					</div>
				</div>
			<?php } ?>
		</div>
		<h5 style="margin-top:20px"><i style="color:orange" class="fa-solid fa-circle-exclamation"></i> &nbsp;Notices</h5><hr>
		  <div class="row">
			  <?php 
					foreach ($json_data['RSS'] as $x) {				
						$item =  getRSS($x['host'],$x['tag']);
						if($item==""){ 
							$item="No notices";
						}	
						
						$item_short = mb_strimwidth($item, 0, 75, "...");		
						$bg2="background:#e2e3e5;color:#41464b;border-radius:10px;";
	
						$medium = ["unavailable","inaccessible","difficulty","slow","trouble"];
						foreach ($medium as $word) {
							if (stripos($item_short, $word) !== false) {
								$bg2 = "background:#fff3cd;color:#856404;border-radius:10px;";
								break;
							}
						}
						
						$high = ["error", "problem", "issue","outage","critical","fault"];
						foreach ($high as $word) {
							if (stripos($item_short, $word) !== false) {
								$bg2 = "background:#fddddd;color:maroon;border-radius:10px;";
								break;
							}
						}						
				?>
					<div style="height:100%;overflow:hidden;text-align:center"  class="col-md-4 col-lg-4 col-sm-6 col-xl-4">
					  <div id="statusContainerTemplate" style="margin:5px;height:110px;padding:10px;text-align:center;<?php echo $bg2; ?>" class="statusContainer">
						  <div class="statusHeader">
							<h5 class="statusTitle"><?php echo $x['name']; ?>&nbsp;</h5>					
						  </div>
						  <div class="statusSubtitle">
							<div title="<?php echo $item; ?>" class="sectionUrl"><?php echo $item_short; ?></div>
							<div class="statusUptime"></div>
						  </div>
						</div>
					</div>		
				<?php } ?>
		  </div>
		</div>
    </div>
	<?php 
		if($errors==0){
	?>
		<script>
		$('#webTicker').webTicker();
		$(document).ready(function() {
			document.getElementById("all_status").innerHTML = '<b>All Systems Operational</b>';
			document.getElementById("all_status").classList.remove('alert-danger');
			document.getElementById("all_status").classList.add('alert-success');
			
		});
		</script>
	<?php
		}else{
	?>
		<script>
		$(document).ready(function() {
			document.getElementById("all_status").innerHTML = "<b>Issues Detected In Your Enviroment</b>";
			document.getElementById("all_status").classList.remove('alert-success');
			document.getElementById("all_status").classList.add('alert-danger');
			
		});
		</script>
	<?php
		}
	?>	