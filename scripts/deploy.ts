import { network } from "hardhat";

const { ethers, networkName } = await network.connect();
const [owner] = await ethers.getSigners();

console.log("Using Deployer and Owner:", owner.address);
console.log(
  "Deployer balance:",
  (await owner.provider!.getBalance(owner.address)).toString()
);
console.log("----------------------------------------------");
console.log(`Deploying Compliance to ${networkName}...`);
const Compliance = await ethers.deployContract("Compliance", [owner.address]);
await Compliance.waitForDeployment();
console.log(`Compliance deployed to ${Compliance.target}`);
console.log("----------------------------------------------");

console.log(`Deploying JetOwnershipToken to ${networkName}...`);
const JetOToken = await ethers.deployContract("JetOwnershipToken", [
  owner.address,
  Compliance.target,
]);
await JetOToken.waitForDeployment();
console.log(`JetOwnershipToken deployed to ${JetOToken.target}`);
console.log("----------------------------------------------");

console.log(`Deploying OwnershipStaking to ${networkName}...`);
const OwnershipStaking = await ethers.deployContract("OwnershipStaking", [
  JetOToken.target,
]);
await OwnershipStaking.waitForDeployment();
console.log(`OwnershipStaking deployed to ${OwnershipStaking.target}`);

console.log("----------------------------------------------");

console.log(`Deploying Governance to ${networkName}...`);
const Governance = await ethers.deployContract("Governance", [
  OwnershipStaking.target,
]);
await Governance.waitForDeployment();
console.log(`Governance deployed to ${Governance.target}`);

console.log("----------------------------------------------");

console.log(`Deploying JetUtilityToken to ${networkName}...`);
const JetUtilityToken = await ethers.deployContract("JetUtilityToken", [
  owner.address,
  "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", //usdt
  0,
]);
await JetUtilityToken.waitForDeployment();
console.log(`JetUtilityToken deployed to ${JetUtilityToken.target}`);

console.log("----------------------------------------------");

console.log(`Deploying DividendDistribution to ${networkName}...`);
const DividendDistribution = await ethers.deployContract(
  "DividendDistribution",
  [
    "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", //usdt
    OwnershipStaking.target,
  ]
);
await DividendDistribution.waitForDeployment();
console.log(`DividendDistribution deployed to ${DividendDistribution.target}`);

console.log("----------------------------------------------");

console.log(`Deployment Completed Successfully!`);
