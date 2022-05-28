import hre, { ethers } from "hardhat";
import { EnglishAuction__factory } from "../typechain-types/factories/contracts/EnglishAuction__factory";

async function main() {
  const delay = (ms: any) => new Promise((res) => setTimeout(res, ms));

  const Auction = (await ethers.getContractFactory('EnglishAuction')) as EnglishAuction__factory;
  const auction = await Auction.deploy();

  await auction.deployed();

  console.log("English Auction deployed to:", auction.address);

  await delay(35000);

  await hre.run("verify:verify", {
    address: "0x8FE60279371876b0819e769B5Ce23de236B57Aa3",
    constructorArguments: [],
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
