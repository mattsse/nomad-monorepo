import { Flags, CliUx } from "@oclif/core";
import * as config from "@nomad-xyz/configuration";
import Command from "../../Base";
import Artifacts from "../../Artifacts";
import Forge from "../../Forge";
import PrintGovActions from "../printGovActions";

export default class Upgrade extends Command {
  static description = "Upgrade the Nomad Protocol on any number of domains";
  static usage = "upgrade -c <path_to_config> -a --FLAGS";
  static aliases = ["upgrade"];
  static examples = [
    "$ upgrade -c <path_to_config> -a",
    "$ upgrade -c <path_to_config> -d ethereum evmos",
    "$ upgrade -c <path_to_config> -k <private_key> -a",
    "$ upgrade -c <path_to_config> -a -r",
    "$ upgrade -c <path_to_config> -a -t",
  ];
  static flags = {
    ...Command.flags,
    resume: Flags.boolean({ char: "r" }),
    test: Flags.boolean({
      char: "t",
      description: `
Run the upgrade against local RPC nodes. It expects RPC endpoints with a port number that start ats '8545' and increments (e.g 8546, 8647, etc.)
`,
    }),
    privateKey: Flags.string({
      char: "k",
      description:
        "Private key to be used for issuing the upgrade transactions",
      required: true,
      env: "PRIVATE_KEY",
    }),
    domains: Flags.string({
      char: "d",
      multiple: true,
      exclusive: ["all"],
      description: `
Run the command on specific domain(s). To pass multiple domains, simply pass them like this: -d ethereum evmos avalanche.
Due to a parsing bug, this flag must be passed at the end of the command. e.g 'nomgrade upgrade -d ethereum'`,
    }),
    all: Flags.boolean({
      char: "a",
      description: "Run on all the domains that exist in the config file",
      exclusive: ["domains"],
    }),
  };

  flags: any;
  rpcs: any;
  domains: string[];

  async run(): Promise<void> {
    this.announce("Welcome to Nomgrade");

    // parse flags from CLI command
    const { flags } = await this.parse(Upgrade);
    this.flags = flags;

    // Instantiate the Domains that will be upgraded
    this.setDomains();

    // Instantiate the RPC endpoints for each Upgrade domain
    this.setRPCs();

    CliUx.ux.action.start("Upgrading the Nomad Protocol");
    this.warn(
      "The forge output is being buffered and will be printed as the upgrade pipeline finish on each network"
    );

    // run the upgrade scripts in parallel
    await Promise.all(
      this.domains.map((domain) =>
        this.upgradeDomain(domain, this.flags.resume)
      )
    );

    // print governance actions
    await PrintGovActions.print(this.nomadConfig, this.workingDir);

    // finish
    CliUx.ux.action.stop(
      "Implementations have been deployed and artifacts have stored"
    );
  }

  async upgradeDomain(domainName: string, resume: boolean): Promise<void> {
    // get arguments for the forge script
    const domain: number =
      this.nomadConfig.protocol.networks[domainName].domain;
    const rpc = this.rpcs[domainName][0];

    // instantiate the forge script command
    const forge = new Forge(this.nomadConfig, domainName, this.workingDir);
    forge.scriptCommand(
      domainName,
      "deploy(uint32, string)",
      `${domain} ${domainName}`,
      "../../solscripts/Upgrade.sol",
      "Upgrade",
      rpc,
      this.flags.privateKey,
      resume,
      true
    );

    try {
      // run the forge script
      const { stdout, stderr } = await forge.executeCommand();
      if (stderr) {
        this.warn(`${stderr}`);
      }
      if (stdout) {
        this.log(`${stdout}`);
      }

      // construct an artifacts object with raw forge output
      const artifacts = new Artifacts(
        `${stdout}`,
        domainName,
        this.nomadConfig,
        this.workingDir
      );
      // store the raw forge output
      artifacts.storeOutput("upgrade");
      // update the config in-place within the artifacts
      artifacts.updateImplementations();
      // output the updated config from the artifacts object
      artifacts.storeNewConfig();
    } catch (error) {
      this.error("Forge execution encountered an error");
      this.error(
        "If the error is the following: 'monorepo/cache: No such file or directory (os error 2)', simply run the command again"
      );
      this.error(`${error}`);
    }
  }

  private setDomains() {
    if (!this.flags.domains && !this.flags.all) {
      throw new Error(
        "No domains were passed via the appropriate flags. You need to select to which domains the Nomad protocol will be upgraded. Type --help for more"
      );
    }
    this.domains = this.flags.all
      ? this.nomadConfig.networks
      : this.flags.domains;
    this.log(`The following domains will be upgraded: ${this.domains}`);
  }

  private setRPCs() {
    if (this.flags.test) {
      this.announce("Upgrade script will run in test mode");
      this.rpcs = this.getTestRPCs(this.domains);
    } else {
      this.rpcs = this.getRPCs(this.domains);
    }

    this.announce("RPC endpoints");
    console.log("The following RPC endpoints will be used");
    console.log(this.rpcs);
  }

  private getTestRPCs(domains: Array<string>) {
    console.log(
      "It expects to find local EVM-compatible RPC endpoints, that listen on an incrementing port number, starting at 8545"
    );
    console.log(
      "Use multi-anvil.sh to quickly spin up multiple anvil instances with incrementing port number"
    );
    const rpcs = {};
    for (const index in domains) {
      const port: number = 8545 + Number.parseInt(index);
      rpcs[domains[index]] = [`http://127.0.0.1:${port}`];
    }
    return rpcs;
  }

  private getRPCs(domains: Array<string>) {
    const rpcs = {};
    domains.map((domain) => {
      rpcs[domain] = this.nomadConfig.rpcs[domain];
    });
    return rpcs;
  }

  private loadEnv(domainName: string) {
    const recoveryTimelock =
      this.nomadConfig.protocol.networks[domainName].configuration.governance
        .recoveryTimelock;
    process.env.NOMAD_XAPP_CONNECTION_MANAGER =
      this.nomadConfig.core[domainName].xAppConnectionManager;
    process.env.NOMAD_RECOVERY_TIMELOCK = recoveryTimelock.toString();
  }
}
