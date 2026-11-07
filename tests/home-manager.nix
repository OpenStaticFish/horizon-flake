{
  lib,
  pkgs,
  package,
  module,
}:
let
  # Check this module's contract without making Home Manager a runtime flake input.
  evaluate =
    settings:
    lib.evalModules {
      specialArgs = { inherit pkgs; };
      modules = [
        module
        {
          options.home.packages = lib.mkOption {
            type = lib.types.listOf lib.types.package;
            default = [ ];
          };
        }
        settings
      ];
    };
  disabled = evaluate { };
  enabled = evaluate { programs.horizon.enable = true; };
  overridden = evaluate {
    programs.horizon = {
      enable = true;
      package = pkgs.hello;
    };
  };
in
assert disabled.config.home.packages == [ ];
assert enabled.config.home.packages == [ package ];
assert overridden.config.home.packages == [ pkgs.hello ];
true
