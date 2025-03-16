function relaxLogistic(x, x1=1.0, A=100, k=5.49, C=0) {
    console.log(A / (1 + Math.exp(-k * (x - x1))) + C);
    return  A / (1 + Math.exp(-k * (x - x1))) + C;
}

export {relaxLogistic}