//! Release-only Windows updater. Nothing in this module affects the offline FPTP transport.
//! The trusted source is a single pinned GitHub repository and GitHub's asset SHA-256 digest.
use std::{io::{Read,Write}, process::Command, time::Duration};
use sha2::{Digest,Sha256};
use tauri::{AppHandle,Emitter};

const RELEASE_API:&str="https://api.github.com/repos/s3rchan/Fileport-PC-v1.6/releases/latest";
const RELEASE_BASE:&str="https://github.com/s3rchan/Fileport-PC-v1.6/releases/download/";
const MAX_INSTALLER:u64=500*1024*1024;

#[derive(Clone,Debug)]
struct Installer {
 version:String,
 url:String,
 name:String,
 size:u64,
 digest:String,
 notes:String,
}

enum ReleaseCheck {Unpublished, Current, Available(Installer)}

fn parse_semver(value:&str)->Option<[u64;3]>{
 let parts=value.split('.').collect::<Vec<_>>();
 if parts.len()!=3 {return None;}
 let mut output=[0u64;3];
 for (i,part) in parts.iter().enumerate(){
  if part.is_empty()||!part.bytes().all(|c|c.is_ascii_digit())||(part.len()>1&&part.starts_with('0')){return None;}
  output[i]=part.parse().ok()?;
 }
 Some(output)
}

fn http_client()->Result<reqwest::blocking::Client,String>{
 reqwest::blocking::Client::builder()
  .https_only(true).connect_timeout(Duration::from_secs(10))
  .timeout(Duration::from_secs(600))
  .user_agent(concat!("Fileport-PC/",env!("CARGO_PKG_VERSION")))
  .build().map_err(|e|format!("HTTP client unavailable: {e}"))
}

fn release_check(client:&reqwest::blocking::Client)->Result<ReleaseCheck,String>{
 let response=client.get(RELEASE_API)
  .header(reqwest::header::ACCEPT,"application/vnd.github+json")
  .send().map_err(|e|format!("GitHub connection failed: {e}"))?;
 if response.status()==reqwest::StatusCode::NOT_FOUND{return Ok(ReleaseCheck::Unpublished);}
 let response=response.error_for_status().map_err(|e|format!("GitHub releases unavailable: {e}"))?;
 let release:serde_json::Value=response.json().map_err(|e|format!("Invalid GitHub release response: {e}"))?;
 if release.get("draft").and_then(|v|v.as_bool())!=Some(false)||release.get("prerelease").and_then(|v|v.as_bool())!=Some(false){return Err("Release is not public and stable".into());}
 let tag=release.get("tag_name").and_then(|v|v.as_str()).ok_or("Missing release tag")?;
 let version=tag.strip_prefix("pc-v").ok_or("Unrecognized release tag")?;
 let published=parse_semver(version).ok_or("Invalid release version")?;
 let installed=parse_semver(env!("CARGO_PKG_VERSION")).ok_or("Invalid installed Fileport version")?;
 if published<=installed{return Ok(ReleaseCheck::Current);}
 let assets=release.get("assets").and_then(|v|v.as_array()).ok_or("No release assets")?;
 let tag_base=format!("{RELEASE_BASE}{tag}/");
 let matches=assets.iter().filter_map(|item|{
  let name=item.get("name")?.as_str()?;
  let lc=name.to_ascii_lowercase();
  if !lc.starts_with("fileport_")||!lc.contains(&format!("_{version}_"))||!lc.ends_with("-setup.exe")||name.contains('/')||name.contains('\\'){return None;}
  let url=item.get("browser_download_url")?.as_str()?;
  if !url.starts_with(&tag_base)||!url.ends_with(name){return None;}
  let size=item.get("size")?.as_u64()?;
  if !(100_000..=MAX_INSTALLER).contains(&size){return None;}
  let digest=item.get("digest")?.as_str()?.strip_prefix("sha256:")?;
  if digest.len()!=64||!digest.bytes().all(|v|v.is_ascii_hexdigit()){return None;}
  Some(Installer{version:version.to_owned(),url:url.to_owned(),name:name.to_owned(),size,digest:digest.to_owned(),notes:release.get("body").and_then(|v|v.as_str()).unwrap_or("").chars().take(1200).collect()})
 }).collect::<Vec<_>>();
 if matches.len()!=1{return Err("Release must contain exactly one version-matched Fileport NSIS installer with a SHA-256 digest".into());}
 Ok(ReleaseCheck::Available(matches.into_iter().next().unwrap()))
}

#[tauri::command]
pub fn check_github_update()->Result<serde_json::Value,String>{
 #[cfg(not(target_os="windows"))]
 {return Err("GitHub updates are Windows-only".into());}
 #[cfg(target_os="windows")]
 {
  let status=release_check(&http_client()?)?;
  let current=env!("CARGO_PKG_VERSION");
  Ok(match status{
   ReleaseCheck::Unpublished=>serde_json::json!({"status":"unpublished","currentVersion":current}),
   ReleaseCheck::Current=>serde_json::json!({"status":"current","currentVersion":current}),
   ReleaseCheck::Available(r)=>serde_json::json!({"status":"available","currentVersion":current,"version":r.version,"name":r.name,"size":r.size,"notes":r.notes}),
  })
 }
}

// Prevent a signed installed build from being replaced by an unsigned or differently
// signed installer. Unsigned development builds remain supported, but the UI warns.
#[cfg(target_os="windows")]
fn verify_publisher(candidate:&std::path::Path)->Result<(),String>{
 let current=std::env::current_exe().map_err(|e|e.to_string())?;
 let script=r#"$old=Get-AuthenticodeSignature -LiteralPath $env:FILEPORT_CURRENT; $new=Get-AuthenticodeSignature -LiteralPath $env:FILEPORT_UPDATE; if($old.Status -eq 'Valid') { if($new.Status -ne 'Valid' -or !$old.SignerCertificate -or !$new.SignerCertificate -or $old.SignerCertificate.Thumbprint -ne $new.SignerCertificate.Thumbprint){exit 12} } elseif ($new.Status -notin @('Valid','NotSigned')) {exit 13}; exit 0"#;
 let status=Command::new("powershell.exe")
  .args(["-NoProfile","-NonInteractive","-Command",script])
  .env("FILEPORT_CURRENT",current).env("FILEPORT_UPDATE",candidate)
  .status().map_err(|e|format!("Cannot verify Windows installer signature: {e}"))?;
 if !status.success(){return Err("Installer publisher signature validation failed; a signed build cannot update to an unsigned or different-publisher build".into());}
 Ok(())
}

#[tauri::command]
pub fn install_github_update(app:AppHandle,version:String)->Result<String,String>{
 #[cfg(not(target_os="windows"))]
 {let _=(app,version);return Err("GitHub updates are Windows-only".into());}
 #[cfg(target_os="windows")]
 {
  use tempfile::Builder;
  let client=http_client()?;
  let installer=match release_check(&client)?{
   ReleaseCheck::Available(release) if release.version==version=>release,
   _=>return Err("The selected release changed. Check for updates again.".into()),
  };
  let mut response=client.get(&installer.url).send()
   .map_err(|e|format!("Download failed: {e}"))?
   .error_for_status().map_err(|e|format!("Installer download rejected: {e}"))?;
  if response.content_length().is_some_and(|length|length!=installer.size){return Err("Unexpected installer download size".into());}
  let mut file=Builder::new().prefix("Fileport_Update_").suffix(".exe").tempfile().map_err(|e|e.to_string())?;
  let mut sha=Sha256::new();let mut buf=[0u8;128*1024];let mut saved=0u64;let mut last_progress=0u64;
  loop {
   let amount=response.read(&mut buf).map_err(|e|format!("Download interrupted: {e}"))?;
   if amount==0{break;}
   saved=saved.checked_add(amount as u64).ok_or("Installer too large")?;
   if saved>installer.size||saved>MAX_INSTALLER{return Err("Installer exceeds published size".into());}
   file.write_all(&buf[..amount]).map_err(|e|e.to_string())?;
   sha.update(&buf[..amount]);
   let percent=saved*100/installer.size;
   if percent>last_progress{last_progress=percent;let _=app.emit("fileport-update-progress",percent);}
  }
  if saved!=installer.size{return Err("Installer download incomplete".into());}
  let digest=format!("{:x}",sha.finalize());
  if !digest.eq_ignore_ascii_case(&installer.digest){return Err("SHA-256 mismatch: refusing to run the installer".into());}
  file.as_file_mut().sync_all().map_err(|e|e.to_string())?;
  verify_publisher(file.path())?;
  // Keep the verified file at its unpredictable filename after launching the installer.
  // File is not automatically executed without the explicit UI confirmation.
  let path=file.into_temp_path();
  let retained=path.keep().map_err(|e|format!("Cannot preserve installer: {e}"))?;
  match Command::new(&retained).spawn(){
   Ok(_)=>Ok("started".into()),
   Err(e)=>{let _=std::fs::remove_file(&retained);Err(format!("Cannot open Fileport installer: {e}"))},
  }
 }
}

#[cfg(test)]
mod tests {
 use super::*;
 #[test]fn accepts_strict_versions(){assert_eq!(parse_semver("1.8.0"),Some([1,8,0]));assert!(parse_semver("1.8").is_none());assert!(parse_semver("1.8.0-rc1").is_none());assert!(parse_semver("1.08.0").is_none());}
}
