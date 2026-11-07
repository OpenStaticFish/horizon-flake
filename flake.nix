{
  description = "Precompiled Horizon launcher for NixOS and Home Manager";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
      sources = builtins.fromJSON (builtins.readFile ./sources.json);
    in
    {
      packages = forAllSystems (
        system:
        let
          package = nixpkgs.legacyPackages.${system}.callPackage ./package.nix { inherit sources; };
        in
        {
          default = package;
          horizon-launcher = package;
        }
      );

      apps = forAllSystems (
        system:
        let
          app = {
            type = "app";
            program = "${self.packages.${system}.default}/bin/horizon-launcher";
            meta.description = "Install, prepare and play Horizon";
          };
        in
        {
          default = app;
          horizon-launcher = app;
        }
      );

      homeManagerModules = rec {
        default = horizon;
        horizon = import ./modules/home-manager.nix { inherit self; };
      };

      overlays.default = final: _prev: {
        horizon-launcher = final.callPackage ./package.nix { inherit sources; };
      };

      checks = forAllSystems (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          package = self.packages.${system}.default;
        in
        {
          inherit package;
          desktop-entry =
            pkgs.runCommand "horizon-desktop-entry-check"
              {
                nativeBuildInputs = [ pkgs.desktop-file-utils ];
              }
              ''
                test -x ${package}/bin/horizon-launcher
                desktop-file-validate ${package}/share/applications/horizon-launcher.desktop
                test -f ${package}/share/icons/hicolor/512x512/apps/horizon.png
                grep -F 'HORIZON_LAUNCHER_NO_SELF_UPDATE' ${package}/bin/horizon-launcher
                grep -F "export HORIZON_LAUNCHER_DESKTOP_EXEC='horizon-launcher'" ${package}/bin/horizon-launcher
                touch "$out"
              '';
          home-manager-module =
            assert import ./tests/home-manager.nix {
              inherit (pkgs) lib;
              inherit pkgs package;
              module = self.homeManagerModules.default;
            };
            pkgs.runCommand "horizon-home-manager-module-check" { } ''
              touch "$out"
            '';
        }
      );

      formatter = forAllSystems (system: nixpkgs.legacyPackages.${system}.nixfmt-tree);

      devShells = forAllSystems (system: {
        default = nixpkgs.legacyPackages.${system}.mkShellNoCC {
          packages = with nixpkgs.legacyPackages.${system}; [
            actionlint
            bun
            nixfmt-tree
          ];
        };
      });
    };
}
