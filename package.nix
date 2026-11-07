{
  lib,
  appimageTools,
  fetchurl,
  makeWrapper,
  symlinkJoin,
  sources,
}:
let
  pname = "horizon-launcher";
  inherit (sources) version;

  src = fetchurl {
    inherit (sources) url hash;
  };

  appimage = appimageTools.wrapType2 (finalAttrs: {
    inherit pname version src;

    # The launcher and its downloaded games are 64-bit. Avoid an unused 32-bit runtime.
    multiArch = false;

    extraInstallCommands = ''
      install -Dm444 ${finalAttrs.contents}/horizon-launcher.desktop \
        "$out/share/applications/horizon-launcher.desktop"
      mkdir -p "$out/share/icons"
      cp -r ${finalAttrs.contents}/usr/share/icons/hicolor "$out/share/icons/"
    '';
  });
in
symlinkJoin {
  inherit pname version;
  paths = [ appimage ];
  nativeBuildInputs = [ makeWrapper ];

  postBuild = ''
    # Updates belong to Nix; a self-update cannot replace a read-only store path.
    # Use the profile's stable command so Horizon's desktop entry survives upgrades and GC.
    wrapProgram "$out/bin/horizon-launcher" \
      --set HORIZON_LAUNCHER_NO_SELF_UPDATE 1 \
      --set HORIZON_LAUNCHER_DESKTOP_EXEC horizon-launcher
  '';

  passthru = {
    inherit src;
    unwrapped = appimage;
  };

  meta = {
    description = "Launcher for Horizon, a native Rust reimplementation of Minecraft: Java Edition";
    homepage = "https://github.com/horizon-rust/horizon";
    changelog = "https://github.com/horizon-rust/horizon/releases/tag/${sources.tag}";
    license = lib.licenses.mit;
    sourceProvenance = [ lib.sourceTypes.binaryNativeCode ];
    platforms = [ "x86_64-linux" ];
    mainProgram = "horizon-launcher";
  };
}
