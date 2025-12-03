import "forge-std/Test.sol";
import "../contracts/JetOToken.sol";

contract JetOTokenTest is Test {
JetOToken public token;
address public spv = address(0xABCD);
address public user = address(0x1234);


function setUp() public {
    token = new JetOToken(spv);
}

function testInitialState() public {
    assertEq(token.decimals(), 3);
    assertEq(token.cap(), 1000 * 10**3);
    assertTrue(token.hasRole(token.SPV_ROLE(), spv));
    assertTrue(token.hasRole(token.DEFAULT_ADMIN_ROLE(), spv));
}

function testMintBySPV() public {
    uint256 amount = 10 * 10**3;
    vm.prank(spv);
    token.mint(user, amount);
    assertEq(token.balanceOf(user), amount);
}

function testMintPaused() public {
    uint256 amount = 10 * 10**3;
    vm.prank(spv);
    token.pause();

    vm.prank(spv);
    vm.expectRevert(); // 只检测 revert，不匹配错误类型
    token.mint(user, amount);
}

function testPauseUnpause() public {
    vm.prank(spv);
    token.pause();
    assertTrue(token.paused());

    vm.prank(spv);
    token.unpause();
    assertFalse(token.paused());
}

function testNonSPVCannotMint() public {
    uint256 amount = 10 * 10**3;
    vm.prank(user);
    vm.expectRevert();
    token.mint(user, amount);
}

function testSetStakingContract() public {
    address staking = address(0xDEAD);
    vm.prank(spv);
    token.setStakingContract(staking);
    assertEq(token.stakingContract(), staking);
}

function testTransferWithPause() public {
    uint256 amount = 10 * 10**3;
    vm.prank(spv);
    token.mint(spv, amount);

    vm.prank(spv);
    token.pause();

    vm.prank(spv);
    vm.expectRevert(); // 只检测 revert，不匹配错误类型
    token.transfer(user, amount);
}


}
