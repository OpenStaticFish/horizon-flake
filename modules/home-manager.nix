{ self }:
{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.horizon;
  system = pkgs.stdenv.hostPlatform.system;
in
{
  options.programs.horizon = {
    enable = lib.mkEnableOption "the precompiled Horizon launcher";

    package = lib.mkOption {
      type = lib.types.package;
      default =
        self.packages.${system}.default
          or (throw "Horizon currently publishes Linux launcher binaries only for x86_64-linux.");
      defaultText = lib.literalExpression "inputs.horizon.packages.\${pkgs.stdenv.hostPlatform.system}.default";
      description = "The Horizon launcher package to install.";
    };
  };

  config = lib.mkIf cfg.enable {
    home.packages = [ cfg.package ];
  };
}
